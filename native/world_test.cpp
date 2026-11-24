#include "world.h"
#include <stdexcept>
#include <limits>
int main()
{
    using namespace nirn::world;
    int transition=1, worldA=2, worldB=3;
    if (worldMapCameraReady(&transition,&worldA,&worldB) ||
        worldMapCameraReady<int>(nullptr,&worldA,&worldB) ||
        !worldMapCameraReady(&worldA,&worldA,&worldB) ||
        !worldMapCameraReady(&worldB,&worldA,&worldB))
        throw std::runtime_error("map camera readiness failed");
    if (mapReadiness(true,true,false,false,false,false,false)!=MapReadiness::wait ||
        mapReadiness(true,true,false,true,true,false,false)!=MapReadiness::wait ||
        mapReadiness(true,true,true,true,true,false,false)!=MapReadiness::fallback ||
        mapReadiness(true,true,false,true,false,false,false)!=MapReadiness::cancel ||
        mapReadiness(false,true,false,true,true,true,true)!=MapReadiness::cancel ||
        mapReadiness(true,false,false,true,true,true,true)!=MapReadiness::cancel ||
        mapReadiness(true,true,false,true,true,true,false)!=MapReadiness::fallback ||
        mapReadiness(true,true,false,true,true,true,true)!=MapReadiness::match)
        throw std::runtime_error("map lifecycle failed");
    struct Marker { std::uint32_t ref; };
    std::vector<Marker> markers{{4},{9},{7}};
    auto match=matchMapMarker(markers,9u);
    if (match.count!=1 || match.index!=1) throw std::runtime_error("map marker match failed");
    if (matchMapMarker(markers,0u).count || matchMapMarker(markers,5u).count) throw std::runtime_error("missing marker matched");
    markers.push_back({9});
    if (matchMapMarker(markers,9u).count!=2) throw std::runtime_error("duplicate marker accepted");
    markers={{9},{4}};
    if (matchMapMarker(markers,9u).index!=0) throw std::runtime_error("marker order reused");
    if (!eligibleLocation(42,true,true,true) || eligibleLocation(0,true,true,true) ||
        eligibleLocation(42,false,true,true) || eligibleLocation(42,true,false,true) ||
        eligibleLocation(42,true,true,false)) throw std::runtime_error("location eligibility failed");
    std::unordered_set<std::uint32_t> markerIds;
    std::vector<std::uint32_t> candidates;
    if (!appendLocationCandidate(42,markerIds,candidates) || appendLocationCandidate(42,markerIds,candidates) ||
        appendLocationCandidate(0,markerIds,candidates) || !appendLocationCandidate(0xFE001123,markerIds,candidates) ||
        candidates.size()!=2 || candidates[0]!=42 || candidates[1]!=0xFE001123) {
        throw std::runtime_error("location identity deduplication failed");
    }
    ActorCandidate a{1, "Guard", 20, true, true, true, true, false, true};
    ActorCandidate b{2, "Guard", 10, true, true, true, true, false, true};
    auto far = a; far.identity = 3; far.distance = 101;
    auto dead = a; dead.identity = 4; dead.living = false;
    auto otherWorld = a; otherWorld.identity = 5; otherWorld.sameSpace = false;
    auto unloaded = a; unloaded.identity = 6; unloaded.loaded = false;
    auto invalid = a; invalid.identity = 7; invalid.distance = std::numeric_limits<float>::quiet_NaN();
    auto actors = nearby({a,b,a,far,dead,otherWorld,unloaded,invalid}, 100);
    if (actors.size() != 2 || actors[0].identity != 2 || actors[1].identity != 1) throw std::runtime_error("filter, ordering or identity failed");
    if (nearby({a,b},100,1).front().identity != 2) throw std::runtime_error("limit failed");
    if (!nearby({a},10).empty()) throw std::runtime_error("radius failed");
    if (uniqueDiscoveredMarker({}).has_value()) throw std::runtime_error("unobserved marker leaked");
    if (uniqueDiscoveredMarker({10,11}).has_value()) throw std::runtime_error("ambiguous discovery accepted");
    if (uniqueDiscoveredMarker({0,10,10}) != 10) throw std::runtime_error("duplicate handles lost discovery");
}

