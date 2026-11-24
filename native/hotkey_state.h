#pragma once

#include <chrono>
#include <cstdint>

namespace nirn::hotkey {
class State {
public:
    using Clock = std::chrono::steady_clock;

    void reset(bool physicallyHeld)
    {
        armed_ = !physicallyHeld;
        held_ = physicallyHeld;
        ++generation_;
        pending_ = 0;
    }

    std::uint64_t down(bool repeat, int observedModifiers, int expectedModifiers, bool available,
        Clock::time_point now)
    {
        if (repeat || !armed_) return 0;
        held_ = true;
        if (observedModifiers != expectedModifiers || !available) return 0;
        pending_ = ++sequence_;
        pendingGeneration_ = generation_;
        captured_ = now;
        return pending_;
    }

    void up()
    {
        held_ = false;
        armed_ = true;
    }

    bool consume(std::uint64_t token, Clock::time_point now)
    {
        const bool valid = token && token == pending_ && pendingGeneration_ == generation_ &&
            now >= captured_ && now - captured_ <= std::chrono::milliseconds(250);
        if (token == pending_) pending_ = 0;
        return valid;
    }

    bool held() const { return held_; }
    bool armed() const { return armed_; }

private:
    bool held_ = false;
    bool armed_ = false;
    std::uint64_t generation_ = 0;
    std::uint64_t pendingGeneration_ = 0;
    std::uint64_t sequence_ = 0;
    std::uint64_t pending_ = 0;
    Clock::time_point captured_{};
};
}
