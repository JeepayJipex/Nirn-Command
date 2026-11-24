#include "hotkey_state.h"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>

int main()
{
    using namespace nirn::hotkey;
    using namespace std::chrono_literals;
    State state;
    const auto now = State::Clock::now();
    state.reset(true);
    assert(!state.down(false, 0, 0, true, now));
    state.up();
    auto first = state.down(false, 1, 1, true, now);
    assert(first && !state.down(true, 1, 1, true, now));
    assert(state.consume(first, now + 100ms));
    assert(!state.consume(first, now + 100ms));
    auto second = state.down(false, 1, 1, true, now + 110ms);
    assert(second && !state.consume(second, now + 361ms));
    assert(!state.down(false, 0, 1, true, now));
    assert(!state.down(false, 1, 1, false, now));
    auto stale = state.down(false, 1, 1, true, now);
    state.reset(false);
    assert(!state.consume(stale, now));
}
