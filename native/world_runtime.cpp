#include "world_runtime.h"
#include <nlohmann/json.hpp>
#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <unordered_set>

namespace nirn::world_runtime {
namespace {
std::mutex mutex;
std::atomic_uint64_t session{1};
std::atomic_bool pending{false};
std::int32_t contextId=0, generation=0;
RE::FormID currentCell=0, currentWorld=0;
std::vector<std::string> rows, transfer;
std::unordered_map<std::uint32_t, RE::ObjectRefHandle> handles;
std::unordered_map<std::uint32_t, std::string> inspections;
std::unordered_set<RE::FormID> discoveredLocations;
std::vector<std::string> locationRows, locationTransfer;
std::unordered_map<RE::FormID,std::string> locationInspections;
std::int32_t locationGeneration=0;
bool locationsDirty=true;
constexpr std::uint32_t recordType=0x4E434C31;

std::string locationRow(RE::TESObjectREFR* ref)
{
    if (!ref || ref->IsDeleted() || ref->IsDisabled()) return {};
    auto extra=ref->extraList.GetByType<RE::ExtraMapMarker>();
    if (!extra || !extra->mapData || !extra->mapData->flags.any(RE::MapMarkerData::Flag::kVisible)) return {};
    const char* name=extra->mapData->locationName.GetFullName();
    if (!name || !*name) return {};
    auto world=ref->GetWorldspace();
    const char* worldName=world ? world->GetName() : nullptr;
    std::string place=worldName && *worldName ? worldName : "Worldspace unavailable";
    auto token=static_cast<std::int32_t>(ref->GetFormID());
    nlohmann::json row={{"id","location:"+std::to_string(token)},{"token",std::to_string(token)},{"label",name},{"detail",place}};
    return row.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);
}

void updateLocations(std::uint64_t request)
{
    std::vector<RE::FormID> ids;
    {std::scoped_lock lock(mutex); if (!locationsDirty || request!=session.load()) return; locationsDirty=false; ids.assign(discoveredLocations.begin(),discoveredLocations.end());}
    std::sort(ids.begin(),ids.end());
    std::vector<std::string> next;
    for (auto id:ids) {
        auto row=locationRow(RE::TESForm::LookupByID<RE::TESObjectREFR>(id));
        if (!row.empty()) next.push_back(std::move(row));
    }
    std::scoped_lock lock(mutex);
    if (request!=session.load()) return;
    if (locationRows!=next || !locationGeneration) {locationRows=std::move(next); ++locationGeneration;}
}

class DiscoverySink : public RE::BSTEventSink<RE::LocationDiscovery::Event> {
public:
    RE::BSEventNotifyControl ProcessEvent(const RE::LocationDiscovery::Event* event, RE::BSTEventSource<RE::LocationDiscovery::Event>*) override
    {
        if (!event || !event->mapMarkerData) return RE::BSEventNotifyControl::kContinue;
        auto player=RE::PlayerCharacter::GetSingleton();
        if (!player) return RE::BSEventNotifyControl::kContinue;
        RE::FormID found=0; unsigned matches=0;
        for (const auto& handle:player->GetPlayerRuntimeData().currentMapMarkers) {
            auto ref=handle.get();
            auto extra=ref ? ref->extraList.GetByType<RE::ExtraMapMarker>() : nullptr;
            if (extra && extra->mapData==event->mapMarkerData) {found=ref->GetFormID(); ++matches;}
        }
        if (matches==1 && found) {
            std::scoped_lock lock(mutex);
            if (discoveredLocations.insert(found).second) locationsDirty=true;
        } else SKSE::log::warn("World location discovery unresolved matches={} world={}",matches,event->worldspaceID ? event->worldspaceID : "unknown");
        return RE::BSEventNotifyControl::kContinue;
    }
};
DiscoverySink discoverySink;
void save(SKSE::SerializationInterface* intfc)
{
    std::scoped_lock lock(mutex);
    std::vector<RE::FormID> ids(discoveredLocations.begin(),discoveredLocations.end());
    if (!ids.empty() && !intfc->WriteRecord(recordType,1,ids.data(),static_cast<std::uint32_t>(ids.size()*sizeof(RE::FormID)))) SKSE::log::error("World location save failed");
}
void revert(SKSE::SerializationInterface*)
{
    std::scoped_lock lock(mutex);
    discoveredLocations.clear(); locationRows.clear(); locationTransfer.clear(); locationInspections.clear(); locationGeneration=0; locationsDirty=true;
}
void load(SKSE::SerializationInterface* intfc)
{
    revert(intfc);
    std::uint32_t type=0,version=0,length=0;
    while (intfc->GetNextRecordInfo(type,version,length)) {
        if (type!=recordType || version!=1 || length%sizeof(RE::FormID) || length>40000) continue;
        std::vector<RE::FormID> ids(length/sizeof(RE::FormID));
        if (intfc->ReadRecordData(ids.data(),length)!=length) continue;
        std::scoped_lock lock(mutex);
        for (auto oldId:ids) {RE::FormID resolved=0; if (intfc->ResolveFormID(oldId,resolved) && resolved) discoveredLocations.insert(resolved);}
    }
}
void message(SKSE::MessagingInterface::Message* msg)
{
    if (msg && msg->type==SKSE::MessagingInterface::kDataLoaded) {
        if (auto source=RE::LocationDiscovery::GetEventSource()) source->AddEventSink(&discoverySink);
        else SKSE::log::error("World location discovery event source unavailable");
    }
}

float radius()
{
    static float value=[] {
        std::ifstream input("Data/SKSE/Plugins/NirnCommand/world.json");
        auto config=nlohmann::json::parse(input,nullptr,false);
        if (!config.is_object() || !config.contains("npcRadius") || !config["npcRadius"].is_number()) return 8192.0f;
        const float candidate=config["npcRadius"].get<float>();
        return std::isfinite(candidate) ? std::clamp(candidate,1024.0f,32768.0f) : 8192.0f;
    }();
    return value;
}
bool valid(RE::Actor* actor, RE::PlayerCharacter* player)
{
    if (!actor || !player || actor==player || actor->IsDeleted() || actor->IsDisabled() ||
        actor->IsDead() || !actor->Is3DLoaded() || !actor->IsHumanoid()) return false;
    auto cell=player->GetParentCell(); auto other=actor->GetParentCell();
    if (!cell || !other) return false;
    if (cell->IsInteriorCell() || other->IsInteriorCell()) return cell==other;
    return player->GetWorldspace() && player->GetWorldspace()==actor->GetWorldspace();
}
std::string detail(RE::Actor* actor, RE::PlayerCharacter* player, float distance)
{
    const auto pos=actor->GetPosition(), origin=player->GetPosition();
    constexpr float pi=3.14159265358979323846f;
    float angle=std::atan2(pos.x-origin.x,pos.y-origin.y)-player->GetAngle().z;
    angle=std::remainder(angle,2*pi);
    const char* direction=std::abs(angle)<pi/4 ? "ahead" : std::abs(angle)>3*pi/4 ? "behind" : angle>0 ? "right" : "left";
    std::string place;
    if (auto location=actor->GetCurrentLocation(); location && location->GetName()) place=location->GetName();
    if (place.empty()) if (auto cell=actor->GetParentCell(); cell && cell->GetName()) place=cell->GetName();
    return std::to_string(static_cast<int>(std::round(distance)))+" units · "+direction+(place.empty()?"":" · "+place);
}
}
void reset(RE::StaticFunctionTag*)
{
    ++session;
    std::scoped_lock lock(mutex);
    currentCell=currentWorld=0; contextId=0; generation=0; rows.clear(); transfer.clear(); handles.clear(); inspections.clear(); locationRows.clear(); locationTransfer.clear(); locationInspections.clear(); locationGeneration=0; locationsDirty=true;
}
void refresh(RE::StaticFunctionTag*)
{
    if (pending.exchange(true)) return;
    const auto request=session.load();
    SKSE::GetTaskInterface()->AddTask([request] {
        const auto started=std::chrono::steady_clock::now();
        auto player=RE::PlayerCharacter::GetSingleton(); auto processes=RE::ProcessLists::GetSingleton();
        if (!player || !processes || !player->GetParentCell()) { pending=false; return; }
        updateLocations(request);
        auto cell=player->GetParentCell()->GetFormID();
        auto world=player->GetWorldspace() ? player->GetWorldspace()->GetFormID() : 0;
        struct Item { float distance; std::uint32_t token; std::string row; RE::ObjectRefHandle handle; };
        std::vector<Item> found;
        std::size_t examined=0;
        processes->ForEachHighActor([&](RE::Actor* actor) {
            if (++examined>1024) return RE::BSContainer::ForEachResult::kStop;
            if (!valid(actor,player)) return RE::BSContainer::ForEachResult::kContinue;
            const char* name=actor->GetDisplayFullName();
            const float distance=actor->GetDistance(player);
            if (!name || !*name || !std::isfinite(distance) || distance<0 || distance>radius()) return RE::BSContainer::ForEachResult::kContinue;
            auto handle=actor->GetHandle(); const auto token=handle.native_handle();
            if (!token) return RE::BSContainer::ForEachResult::kContinue;
            const auto signedToken=static_cast<std::int32_t>(token);
            nlohmann::json row={{"id","npc:"+std::to_string(signedToken)},{"token",std::to_string(signedToken)},
                {"label",name},{"distance",distance},{"detail",detail(actor,player,distance)}};
            found.push_back({distance,token,row.dump(-1,' ',false,nlohmann::json::error_handler_t::replace),handle});
            return RE::BSContainer::ForEachResult::kContinue;
        });
        std::sort(found.begin(),found.end(),[](const auto& a,const auto& b){return a.distance!=b.distance ? a.distance<b.distance : a.token<b.token;});
        if (found.size()>256) found.resize(256);
        std::vector<std::string> next; std::unordered_map<std::uint32_t,RE::ObjectRefHandle> nextHandles;
        for (auto& item:found) if (nextHandles.emplace(item.token,item.handle).second) next.push_back(std::move(item.row));
        if (request==session.load()) {
            std::scoped_lock lock(mutex);
            if (request==session.load()) {
                if (cell!=currentCell || world!=currentWorld || !contextId) {currentCell=cell; currentWorld=world; ++contextId; rows.clear(); handles.clear(); inspections.clear();}
                if (rows!=next || !generation) {rows=std::move(next); ++generation;}
                handles=std::move(nextHandles);
            }
        }
        SKSE::log::info("World NPC refresh examined={} actors={} truncated={} elapsed_ms={}",examined,found.size(),examined>1024,std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-started).count());
        pending=false;
    });
}
std::int32_t context(RE::StaticFunctionTag*) {std::scoped_lock lock(mutex); return contextId;}
std::int32_t revision(RE::StaticFunctionTag*) {std::scoped_lock lock(mutex); return generation;}
std::int32_t count(RE::StaticFunctionTag*) {std::scoped_lock lock(mutex); transfer=rows; return static_cast<std::int32_t>(transfer.size());}
RE::BSFixedString entry(RE::StaticFunctionTag*,std::int32_t index) {std::scoped_lock lock(mutex); return index>=0 && static_cast<std::size_t>(index)<transfer.size()?transfer[index]:"";}
void inspect(RE::StaticFunctionTag*,std::int32_t id)
{
    const auto token=static_cast<std::uint32_t>(id); const auto request=session.load();
    {std::scoped_lock lock(mutex); inspections.erase(token);}
    SKSE::GetTaskInterface()->AddTask([request,token] {
        RE::ObjectRefHandle handle;
        {std::scoped_lock lock(mutex); auto it=handles.find(token); if(it!=handles.end()) handle=it->second;}
        auto ref=handle.get(); auto actor=ref ? ref->As<RE::Actor>() : nullptr; auto player=RE::PlayerCharacter::GetSingleton();
        const bool available=valid(actor,player) && actor->GetDistance(player)<=radius();
        nlohmann::json result={{"available",available}};
        if (available) result["detail"]=detail(actor,player,actor->GetDistance(player));
        if (request==session.load()) {std::scoped_lock lock(mutex); if(request==session.load()) inspections[token]=result.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);}
    });
}
RE::BSFixedString inspection(RE::StaticFunctionTag*,std::int32_t id)
{
    std::scoped_lock lock(mutex); auto it=inspections.find(static_cast<std::uint32_t>(id));
    if(it==inspections.end()) return ""; auto result=it->second; inspections.erase(it); return result;
}
void initialize()
{
    auto serialization=SKSE::GetSerializationInterface();
    serialization->SetUniqueID(recordType); serialization->SetSaveCallback(save); serialization->SetLoadCallback(load); serialization->SetRevertCallback(revert);
    SKSE::GetMessagingInterface()->RegisterListener(message);
}
std::int32_t locationRevision(RE::StaticFunctionTag*) {std::scoped_lock lock(mutex); return locationGeneration;}
std::int32_t locationCount(RE::StaticFunctionTag*) {std::scoped_lock lock(mutex); locationTransfer=locationRows; return static_cast<std::int32_t>(locationTransfer.size());}
RE::BSFixedString locationEntry(RE::StaticFunctionTag*,std::int32_t index) {std::scoped_lock lock(mutex); return index>=0 && static_cast<std::size_t>(index)<locationTransfer.size()?locationTransfer[index]:"";}
void inspectLocation(RE::StaticFunctionTag*,std::int32_t id)
{
    auto token=static_cast<RE::FormID>(id); auto request=session.load();
    {std::scoped_lock lock(mutex); locationInspections.erase(token);}
    SKSE::GetTaskInterface()->AddTask([request,token] {
        bool known=false; {std::scoped_lock lock(mutex); known=discoveredLocations.contains(token);}
        auto row=known ? locationRow(RE::TESForm::LookupByID<RE::TESObjectREFR>(token)) : std::string{};
        nlohmann::json result={{"available",!row.empty()}};
        if (!row.empty()) result["detail"]=nlohmann::json::parse(row)["detail"];
        if(request==session.load()) {std::scoped_lock lock(mutex); if(request==session.load()) locationInspections[token]=result.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);}
    });
}
RE::BSFixedString locationInspection(RE::StaticFunctionTag*,std::int32_t id)
{
    std::scoped_lock lock(mutex); auto it=locationInspections.find(static_cast<RE::FormID>(id));
    if(it==locationInspections.end()) return ""; auto result=it->second; locationInspections.erase(it); return result;
}
void openMap(RE::StaticFunctionTag*,std::int32_t id)
{
    const auto token=static_cast<RE::FormID>(id); const auto request=session.load();
    SKSE::GetTaskInterface()->AddTask([request,token] {
        bool known=false; {std::scoped_lock lock(mutex); known=request==session.load() && discoveredLocations.contains(token);}
        if (!known || locationRow(RE::TESForm::LookupByID<RE::TESObjectREFR>(token)).empty()) return;
        auto queue=RE::UIMessageQueue::GetSingleton();
        auto ui=RE::UI::GetSingleton();
        if (queue && ui && !ui->IsApplicationMenuOpen()) queue->AddMessage("MapMenu",RE::UI_MESSAGE_TYPE::kShow,nullptr);
    });
}
}
