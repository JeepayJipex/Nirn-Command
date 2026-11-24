#pragma once
#include <cstdint>
namespace RE { class StaticFunctionTag; }
namespace nirn::hotkey_runtime {
void message(SKSE::MessagingInterface::Message* message);
void configure(RE::StaticFunctionTag*, std::int32_t key, std::int32_t modifiers);
void ready(RE::StaticFunctionTag*, bool value, std::int32_t view);
bool consume(RE::StaticFunctionTag*, std::int32_t token);
void recover(RE::StaticFunctionTag*);
}
