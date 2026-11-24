#pragma once
#include <cstdint>
namespace RE { class StaticFunctionTag; }
namespace nirn::hotkey_runtime {
void initialize();
void configure(RE::StaticFunctionTag*, std::int32_t key, std::int32_t modifiers);
void ready(RE::StaticFunctionTag*, bool value);
bool consume(RE::StaticFunctionTag*, std::int32_t token);
}
