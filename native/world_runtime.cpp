#include "world_runtime.h"
#include "world.h"
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
std::atomic_uint32_t trackingSerial{0};
std::int32_t trackingRequest=0, trackingStatus=0;
RE::NiPointer<RE::Actor> trackingActor;
std::int32_t contextId=0, generation=0;
RE::FormID currentCell=0, currentWorld=0;
std::vector<std::string> rows, transfer;
std::unordered_map<std::uint32_t, RE::ObjectRefHandle> handles;
std::unordered_map<std::uint32_t, std::string> inspections;
std::unordered_set<RE::FormID> discoveredLocations;
std::unordered_set<RE::FormID> knownLocations;
std::vector<RE::FormID> discoveredLocationIds, knownLocationIds;
std::atomic_uint64_t locationChanges{1};
std::vector<std::string> locationRows, locationTransfer;
std::unordered_map<RE::FormID,std::string> locationInspections;
std::int32_t locationGeneration=0;
constexpr std::uint32_t recordType=0x4E434C31;
constexpr std::size_t maxLocationRecordEntries=10000;

// The probe keeps only an index between game-thread calls. It never holds an
// iterator or reference into the engine's mutable marker array across frames.
struct LocationProbe {
    std::uint64_t sessionId{};
    RE::FormID cell{}, world{};
    std::size_t index{}, total{}, eligible{}, excluded{}, duplicates{};
    std::unordered_set<RE::FormID> seen;
    std::chrono::steady_clock::time_point started;
    std::chrono::microseconds elapsed{}, maximumBatch{};
};
std::optional<LocationProbe> locationProbe;
std::atomic_bool locationProbeRequested{false};
std::atomic_bool locationProbePending{false};

void probeLocations(RE::PlayerCharacter* player, std::uint64_t request)
{
    if (!player || !player->GetParentCell() || request!=session.load()) return;
    auto& markers=player->GetPlayerRuntimeData().currentMapMarkers;
    const auto cell=player->GetParentCell()->GetFormID();
    const auto world=player->GetWorldspace() ? player->GetWorldspace()->GetFormID() : 0;
    if (!locationProbe || locationProbe->sessionId!=request || locationProbe->cell!=cell ||
        locationProbe->world!=world || locationProbe->total!=markers.size()) {
        locationProbe.emplace();
        locationProbe->sessionId=request;
        locationProbe->cell=cell;
        locationProbe->world=world;
        locationProbe->total=markers.size();
        locationProbe->started=std::chrono::steady_clock::now();
        SKSE::log::info("Known locations probe started source=currentMapMarkers world={:08X} cell={:08X} candidates={} coverage=current collection only",world,cell,markers.size());
    }
    auto& probe=*locationProbe;
    const auto started=std::chrono::steady_clock::now();
    std::size_t processed=0;
    while (probe.index<probe.total && processed<128 &&
           std::chrono::steady_clock::now()-started<std::chrono::milliseconds(1)) {
        auto ref=markers[probe.index++].get();
        ++processed;
        if (!ref || ref->IsDeleted() || ref->IsDisabled()) { ++probe.excluded; continue; }
        auto extra=ref->extraList.GetByType<RE::ExtraMapMarker>();
        if (!extra || !extra->mapData || !extra->mapData->flags.any(RE::MapMarkerData::Flag::kVisible) ||
            !extra->mapData->locationName.GetFullName() || !*extra->mapData->locationName.GetFullName()) {
            ++probe.excluded;
            continue;
        }
        if (!probe.seen.insert(ref->GetFormID()).second) { ++probe.duplicates; continue; }
        ++probe.eligible;
        SKSE::log::info("Known locations probe visible form={:08X} name={}",ref->GetFormID(),extra->mapData->locationName.GetFullName());
    }
    auto elapsed=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-started);
    probe.elapsed+=elapsed;
    probe.maximumBatch=(std::max)(probe.maximumBatch,elapsed);
    if (probe.index==probe.total) {
        SKSE::log::info("Known locations probe complete world={:08X} candidates={} eligible={} excluded={} duplicates={} enumeration_us={} max_batch_us={} wall_ms={} publication=disabled",probe.world,probe.total,probe.eligible,probe.excluded,probe.duplicates,probe.elapsed.count(),probe.maximumBatch.count(),std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-probe.started).count());
        locationProbe.reset();
    }
}

std::string locationRow(RE::TESObjectREFR* ref)
{
    if (!ref || ref->IsDeleted() || ref->IsDisabled()) return {};
    auto extra=ref->extraList.GetByType<RE::ExtraMapMarker>();
    if (!extra || !extra->mapData || !extra->mapData->flags.any(RE::MapMarkerData::Flag::kVisible)) return {};
    const char* name=extra->mapData->locationName.GetFullName();
    if (!ref->GetFormID() || !name || !*name) return {};
    auto world=ref->GetWorldspace();
    const char* worldName=world ? world->GetName() : nullptr;
    std::string place=worldName && *worldName ? worldName : "Worldspace unavailable";
    auto token=static_cast<std::int32_t>(ref->GetFormID());
    nlohmann::json row={{"id","location:"+std::to_string(token)},{"token",std::to_string(token)},{"label",name},{"detail",place}};
    auto serialized=row.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);
    if (serialized.size()>800) {SKSE::log::warn("World location omitted: encoded row too long form={:08X}",ref->GetFormID()); return {};}
    return serialized;
}

struct LocationImport {
    std::uint64_t sessionId{}, changeId{};
    RE::FormID cell{}, world{};
    std::size_t markerCount{}, index{}, checked{}, excluded{}, duplicates{};
    enum class Phase { known, discovered, markers, validating } phase=Phase::known;
    std::unordered_set<RE::FormID> candidates, eligible;
    std::vector<RE::FormID> ids, eligibleIds;
    std::vector<std::string> rows;
    std::chrono::steady_clock::time_point started;
    std::chrono::microseconds elapsed{}, maximumBatch{};
};
std::optional<LocationImport> locationImport;
std::chrono::steady_clock::time_point lastLocationImport{};
RE::FormID lastImportCell=0, lastImportWorld=0;
std::uint64_t lastImportSession=0, lastImportChange=0;
std::size_t lastImportMarkerCount=0;

void importLocations(RE::PlayerCharacter* player, std::uint64_t request)
{
    if (!player || !player->GetParentCell() || request!=session.load()) return;
    const auto now=std::chrono::steady_clock::now();
    const auto cell=player->GetParentCell()->GetFormID();
    const auto world=player->GetWorldspace() ? player->GetWorldspace()->GetFormID() : 0;
    auto& markers=player->GetPlayerRuntimeData().currentMapMarkers;
    const auto changes=locationChanges.load();
    if (locationImport && (locationImport->sessionId!=request || locationImport->cell!=cell ||
        locationImport->world!=world || locationImport->markerCount!=markers.size() || locationImport->changeId!=changes)) {
        locationImport.reset();
    }
    if (!locationImport) {
        if (lastImportSession==request && lastImportCell==cell && lastImportWorld==world &&
            lastImportChange==changes && lastImportMarkerCount==markers.size() &&
            now-lastLocationImport<std::chrono::seconds(30)) return;
        locationImport.emplace();
        auto& scan=*locationImport;
        scan.sessionId=request; scan.changeId=changes; scan.cell=cell; scan.world=world;
        scan.markerCount=markers.size(); scan.started=now;
        SKSE::log::info("Known locations import started source=currentMapMarkers world={:08X} cell={:08X} candidates={} coverage=progressive",world,cell,markers.size());
    }
    auto& scan=*locationImport;
    const auto batchStart=std::chrono::steady_clock::now();
    std::size_t processed=0;
    while (processed<128 && std::chrono::steady_clock::now()-batchStart<std::chrono::milliseconds(1)) {
        if (scan.phase==LocationImport::Phase::known || scan.phase==LocationImport::Phase::discovered) {
            std::scoped_lock lock(mutex);
            if (request!=session.load() || scan.changeId!=locationChanges.load()) { locationImport.reset(); return; }
            const auto& prior=scan.phase==LocationImport::Phase::known ? knownLocationIds : discoveredLocationIds;
            if (scan.index==prior.size()) {
                scan.index=0;
                scan.phase=scan.phase==LocationImport::Phase::known ? LocationImport::Phase::discovered : LocationImport::Phase::markers;
                continue;
            }
            auto id=prior[scan.index++];
            ++processed;
            if (!nirn::world::appendLocationCandidate(id,scan.candidates,scan.ids)) ++scan.duplicates;
        } else if (scan.phase==LocationImport::Phase::markers) {
            if (scan.index==scan.markerCount) {
                scan.index=0; scan.phase=LocationImport::Phase::validating;
                continue;
            }
            auto ref=markers[scan.index++].get();
            ++processed;
            if (!ref || !ref->GetFormID()) { ++scan.excluded; continue; }
            if (!nirn::world::appendLocationCandidate(ref->GetFormID(),scan.candidates,scan.ids)) ++scan.duplicates;
        } else {
            if (scan.index==scan.ids.size()) break;
            const auto id=scan.ids[scan.index++];
            ++processed; ++scan.checked;
            auto row=locationRow(RE::TESForm::LookupByID<RE::TESObjectREFR>(id));
            if (row.empty()) { ++scan.excluded; continue; }
            scan.eligible.insert(id);
            scan.eligibleIds.push_back(id);
            scan.rows.push_back(std::move(row));
        }
    }
    const auto duration=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-batchStart);
    scan.elapsed+=duration;
    scan.maximumBatch=(std::max)(scan.maximumBatch,duration);
    if (scan.phase!=LocationImport::Phase::validating || scan.index!=scan.ids.size()) return;
    const auto publishStart=std::chrono::steady_clock::now();
    const auto visible=scan.eligible.size();
    {
        std::scoped_lock lock(mutex);
        if (request!=session.load() || scan.changeId!=locationChanges.load()) { locationImport.reset(); return; }
        knownLocations=std::move(scan.eligible);
        knownLocationIds=std::move(scan.eligibleIds);
        if (locationRows!=scan.rows || !locationGeneration) { locationRows=std::move(scan.rows); ++locationGeneration; }
    }
    const auto publication=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-publishStart);
    lastImportSession=request; lastImportCell=cell; lastImportWorld=world; lastImportChange=changes;
    lastImportMarkerCount=markers.size();
    lastLocationImport=std::chrono::steady_clock::now();
    SKSE::log::info("Known locations import complete world={:08X} candidates={} checked={} visible={} excluded={} duplicates={} enumeration_us={} max_batch_us={} publication_us={} wall_ms={} coverage=progressive",world,scan.markerCount,scan.checked,visible,scan.excluded,scan.duplicates,scan.elapsed.count(),scan.maximumBatch.count(),publication.count(),std::chrono::duration_cast<std::chrono::milliseconds>(lastLocationImport-scan.started).count());
    locationImport.reset();
}

class DiscoverySink : public RE::BSTEventSink<RE::LocationDiscovery::Event> {
public:
    RE::BSEventNotifyControl ProcessEvent(const RE::LocationDiscovery::Event* event, RE::BSTEventSource<RE::LocationDiscovery::Event>*) override
    {
        if (!event || !event->mapMarkerData) return RE::BSEventNotifyControl::kContinue;
        auto player=RE::PlayerCharacter::GetSingleton();
        if (!player) return RE::BSEventNotifyControl::kContinue;
        std::vector<std::uint32_t> matches;
        for (const auto& handle:player->GetPlayerRuntimeData().currentMapMarkers) {
            auto ref=handle.get();
            auto extra=ref ? ref->extraList.GetByType<RE::ExtraMapMarker>() : nullptr;
            if (extra && extra->mapData==event->mapMarkerData) matches.push_back(ref->GetFormID());
        }
        auto found=nirn::world::uniqueDiscoveredMarker(matches);
        if (found) {
            std::scoped_lock lock(mutex);
            if (discoveredLocations.insert(*found).second) { discoveredLocationIds.push_back(*found); ++locationChanges; }
        } else SKSE::log::warn("World location discovery unresolved matches={} world={}",matches.size(),event->worldspaceID ? event->worldspaceID : "unknown");
        return RE::BSEventNotifyControl::kContinue;
    }
};
DiscoverySink discoverySink;
void save(SKSE::SerializationInterface* intfc)
{
    std::scoped_lock lock(mutex);
    std::vector<RE::FormID> ids(discoveredLocations.begin(),discoveredLocations.end());
    std::sort(ids.begin(),ids.end());
    for (std::size_t offset=0; offset<ids.size(); offset+=maxLocationRecordEntries) {
        auto count=(std::min)(maxLocationRecordEntries,ids.size()-offset);
        if (!intfc->WriteRecord(recordType,1,ids.data()+offset,static_cast<std::uint32_t>(count*sizeof(RE::FormID)))) {
            SKSE::log::error("World location save failed offset={}",offset);
            break;
        }
    }
}
void revert(SKSE::SerializationInterface*)
{
    ++session;
    std::scoped_lock lock(mutex);
    trackingRequest=trackingStatus=0; trackingActor.reset();
    currentCell=currentWorld=0; contextId=0; generation=0; rows.clear(); transfer.clear(); handles.clear(); inspections.clear();
    discoveredLocations.clear(); knownLocations.clear(); discoveredLocationIds.clear(); knownLocationIds.clear(); locationRows.clear(); locationTransfer.clear(); locationInspections.clear(); locationGeneration=0;
    locationProbeRequested=false;
    SKSE::log::info("Known locations probe reset at save boundary");
}
void load(SKSE::SerializationInterface* intfc)
{
    revert(intfc);
    std::uint32_t type=0,version=0,length=0;
    while (intfc->GetNextRecordInfo(type,version,length)) {
        if (type!=recordType || version!=1 || length%sizeof(RE::FormID) || length>maxLocationRecordEntries*sizeof(RE::FormID)) continue;
        std::vector<RE::FormID> ids(length/sizeof(RE::FormID));
        if (intfc->ReadRecordData(ids.data(),length)!=length) continue;
        std::scoped_lock lock(mutex);
        for (auto oldId:ids) {RE::FormID resolved=0; if (intfc->ResolveFormID(oldId,resolved) && resolved && discoveredLocations.insert(resolved).second) discoveredLocationIds.push_back(resolved);}
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
    locationProbeRequested=false;
    std::scoped_lock lock(mutex);
    knownLocations.clear();
    knownLocationIds.clear();
    trackingRequest=trackingStatus=0; trackingActor.reset();
    currentCell=currentWorld=0; contextId=0; generation=0; rows.clear(); transfer.clear(); handles.clear(); inspections.clear(); locationRows.clear(); locationTransfer.clear(); locationInspections.clear(); locationGeneration=0;
}
void requestLocationRefresh(RE::StaticFunctionTag*) { ++locationChanges; }
void diagnoseLocations(RE::StaticFunctionTag*)
{
    locationProbeRequested=true;
}
void stepLocationProbe(RE::StaticFunctionTag*)
{
    if (locationProbePending.exchange(true)) return;
    const auto request=session.load();
    SKSE::GetTaskInterface()->AddTask([request] {
        if (request==session.load()) {
            auto player=RE::PlayerCharacter::GetSingleton();
            importLocations(player,request);
            if (locationProbeRequested.load()) {
                probeLocations(player,request);
                if (!locationProbe) locationProbeRequested=false;
            }
        }
        locationProbePending=false;
    });
}
std::int32_t nextTrackingRequest(RE::StaticFunctionTag*)
{
    auto value=++trackingSerial;
    if (!value) value=++trackingSerial;
    return static_cast<std::int32_t>(value);
}
void resolveTrackingActor(RE::StaticFunctionTag*, std::int32_t id, std::int32_t expectedContext, std::int32_t requestId)
{
    const auto requestSession=session.load();
    const auto token=static_cast<std::uint32_t>(id);
    {
        std::scoped_lock lock(mutex);
        trackingRequest=requestId; trackingStatus=0; trackingActor.reset();
    }
    SKSE::GetTaskInterface()->AddTask([requestSession, token, expectedContext, requestId] {
        RE::ObjectRefHandle handle;
        {
            std::scoped_lock lock(mutex);
            auto found=handles.find(token);
            if (requestSession==session.load() && expectedContext==contextId && trackingRequest==requestId && found!=handles.end()) handle=found->second;
        }
        auto ref=handle.get();
        auto actor=ref ? ref->As<RE::Actor>() : nullptr;
        auto player=RE::PlayerCharacter::GetSingleton();
        const bool accepted=valid(actor,player) && actor->GetDistance(player)<=radius();
        std::scoped_lock lock(mutex);
        if (requestSession!=session.load() || expectedContext!=contextId || trackingRequest!=requestId) {
            SKSE::log::info("Tracking rejected stale request={} context={} token={:08X}",requestId,expectedContext,token);
            return;
        }
        trackingActor.reset(accepted ? actor : nullptr);
        trackingStatus=accepted ? 1 : -1;
        SKSE::log::info("Tracking validation request={} context={} token={:08X} form={:08X} valid={}",requestId,expectedContext,token,actor ? actor->GetFormID() : 0,accepted);
    });
}
std::int32_t trackingResolutionStatus(RE::StaticFunctionTag*, std::int32_t requestId)
{
    std::scoped_lock lock(mutex);
    return trackingRequest==requestId ? trackingStatus : -1;
}
RE::Actor* trackingResolvedActor(RE::StaticFunctionTag*, std::int32_t requestId)
{
    std::scoped_lock lock(mutex);
    return trackingRequest==requestId && trackingStatus==1 ? trackingActor.get() : nullptr;
}
void clearTrackingResolution(RE::StaticFunctionTag*, std::int32_t requestId)
{
    std::scoped_lock lock(mutex);
    if (requestId && trackingRequest!=requestId) return;
    trackingRequest=trackingStatus=0;
    trackingActor.reset();
}
void refresh(RE::StaticFunctionTag*)
{
    if (pending.exchange(true)) return;
    const auto request=session.load();
    SKSE::GetTaskInterface()->AddTask([request] {
        const auto started=std::chrono::steady_clock::now();
        auto player=RE::PlayerCharacter::GetSingleton(); auto processes=RE::ProcessLists::GetSingleton();
        if (!player || !processes || !player->GetParentCell()) { pending=false; return; }
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
            auto handle=actor->GetHandle(); const auto token=handle.native_handle();
            nirn::world::ActorCandidate candidate{token,name ? name : "",distance,true,true,true,true,false,true};
            if (!nirn::world::eligible(candidate,radius())) return RE::BSContainer::ForEachResult::kContinue;
            const auto signedToken=static_cast<std::int32_t>(token);
            nlohmann::json row={{"id","npc:"+std::to_string(signedToken)},{"token",std::to_string(signedToken)},{"form",std::to_string(actor->GetFormID())},
                {"label",name},{"distance",distance},{"detail",detail(actor,player,distance)}};
            auto serialized=row.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);
            if (serialized.size()>800) {SKSE::log::warn("World NPC omitted: encoded row too long form={:08X}",actor->GetFormID()); return RE::BSContainer::ForEachResult::kContinue;}
            found.push_back({distance,token,std::move(serialized),handle});
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
        bool known=false; {std::scoped_lock lock(mutex); known=knownLocations.contains(token);}
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
        bool known=false; {std::scoped_lock lock(mutex); known=request==session.load() && knownLocations.contains(token);}
        if (!known || locationRow(RE::TESForm::LookupByID<RE::TESObjectREFR>(token)).empty()) return;
        auto queue=RE::UIMessageQueue::GetSingleton();
        auto ui=RE::UI::GetSingleton();
        if (queue && ui && !ui->IsApplicationMenuOpen()) queue->AddMessage("MapMenu",RE::UI_MESSAGE_TYPE::kShow,nullptr);
    });
}
}
