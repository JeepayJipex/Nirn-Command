#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

namespace nirn::world {
inline bool eligibleLocation(std::uint32_t id, bool enabled, bool visible, bool named)
{
    return id && enabled && visible && named;
}
inline bool appendLocationCandidate(std::uint32_t id, std::unordered_set<std::uint32_t>& seen,
    std::vector<std::uint32_t>& ids)
{
    if (!id || !seen.insert(id).second) return false;
    ids.push_back(id);
    return true;
}
struct ActorCandidate {
    std::uint32_t identity{};
    std::string name;
    float distance{};
    bool loaded{}, enabled{}, living{}, humanoid{}, player{}, sameSpace{};
};
inline bool eligible(const ActorCandidate& actor, float radius)
{
    return actor.identity && !actor.name.empty() && actor.loaded && actor.enabled && actor.living &&
        actor.humanoid && !actor.player && actor.sameSpace && std::isfinite(actor.distance) &&
        actor.distance>=0 && actor.distance<=radius;
}

// The caller supplies only references whose map data matched the discovery
// event. Multiple handles to the same reference do not make it ambiguous.
inline std::optional<std::uint32_t> uniqueDiscoveredMarker(const std::vector<std::uint32_t>& matches)
{
    std::uint32_t id=0;
    for (auto candidate : matches) {
        if (!candidate) continue;
        if (id && candidate!=id) return std::nullopt;
        id=candidate;
    }
    if (!id) return std::nullopt;
    return id;
}

// The caller copies metadata while the reference is valid; no actor pointers persist.
inline std::vector<ActorCandidate> nearby(std::vector<ActorCandidate> candidates, float radius, std::size_t limit = 256)
{
    std::unordered_set<std::uint32_t> seen;
    std::vector<ActorCandidate> result;
    for (auto& actor : candidates) {
        if (!eligible(actor,radius) || !seen.insert(actor.identity).second) continue;
        result.push_back(std::move(actor));
    }
    std::sort(result.begin(), result.end(), [](const auto& a, const auto& b) {
        return a.distance != b.distance ? a.distance < b.distance : a.identity < b.identity;
    });
    if (result.size() > limit) result.resize(limit);
    return result;
}
}
