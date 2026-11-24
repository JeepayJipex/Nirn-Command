#pragma once

#include <chrono>
#include <cstdint>
#include <deque>

namespace nirn::hotkey {
class State {
public:
    using Clock = std::chrono::steady_clock;

    void reset(bool physicallyHeld)
    {
        armed_ = !physicallyHeld;
        held_ = physicallyHeld;
        ++generation_;
        pending_.clear();
    }

    std::uint64_t down(bool repeat, int observedModifiers, int expectedModifiers, bool available,
        Clock::time_point now)
    {
        if (repeat || !armed_) return 0;
        held_ = true;
        if (observedModifiers != expectedModifiers || !available) return 0;
        if (++sequence_ > 0x7fffffff) sequence_ = 1;
        if (pending_.size() == 16) pending_.pop_front();
        pending_.push_back({sequence_, generation_, now});
        return sequence_;
    }

    void up()
    {
        held_ = false;
        armed_ = true;
    }

    bool consume(std::uint64_t token, Clock::time_point now)
    {
        for (auto it = pending_.begin(); it != pending_.end(); ++it) {
            if (it->token != token) continue;
            const bool valid = it->generation == generation_ && now >= it->captured &&
                now - it->captured <= std::chrono::milliseconds(250);
            pending_.erase(it);
            return valid;
        }
        return false;
    }

    bool held() const { return held_; }
    bool armed() const { return armed_; }

private:
    bool held_ = false;
    bool armed_ = false;
    std::uint64_t generation_ = 0;
    std::uint64_t sequence_ = 0;
    struct Pending { std::uint64_t token; std::uint64_t generation; Clock::time_point captured; };
    std::deque<Pending> pending_;
};
}
