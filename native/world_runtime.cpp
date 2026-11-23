#include "world_runtime.h"
#include <nlohmann/json.hpp>
#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>

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
    currentCell=currentWorld=0; contextId=0; generation=0; rows.clear(); transfer.clear(); handles.clear(); inspections.clear();
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
        processes->ForEachHighActor([&](RE::Actor* actor) {
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
        SKSE::log::info("World NPC refresh actors={} elapsed_ms={}",found.size(),std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-started).count());
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
}
