#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_set>
#include <vector>

namespace nirn::world {
struct ActorCandidate {
    std::uint32_t identity{};
    std::string name;
    float distance{};
    bool loaded{}, enabled{}, living{}, humanoid{}, player{}, sameSpace{};
};

// The caller copies metadata while the reference is valid; no actor pointers persist.
inline std::vector<ActorCandidate> nearby(std::vector<ActorCandidate> candidates, float radius, std::size_t limit = 256)
{
    std::unordered_set<std::uint32_t> seen;
    std::vector<ActorCandidate> result;
    for (auto& actor : candidates) {
        if (!actor.identity || actor.name.empty() || !actor.loaded || !actor.enabled || !actor.living ||
            !actor.humanoid || actor.player || !actor.sameSpace || !std::isfinite(actor.distance) ||
            actor.distance < 0 || actor.distance > radius || !seen.insert(actor.identity).second) continue;
        result.push_back(std::move(actor));
    }
    std::sort(result.begin(), result.end(), [](const auto& a, const auto& b) {
        return a.distance != b.distance ? a.distance < b.distance : a.identity < b.identity;
    });
    if (result.size() > limit) result.resize(limit);
    return result;
}
}
