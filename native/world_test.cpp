#include "world.h"
#include <stdexcept>
#include <limits>
int main()
{
    using namespace nirn::world;
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
}

