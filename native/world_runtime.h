#pragma once
#include "PCH.h"
namespace nirn::world_runtime {
void reset(RE::StaticFunctionTag*);
void refresh(RE::StaticFunctionTag*);
std::int32_t context(RE::StaticFunctionTag*);
std::int32_t revision(RE::StaticFunctionTag*);
std::int32_t count(RE::StaticFunctionTag*);
RE::BSFixedString entry(RE::StaticFunctionTag*, std::int32_t);
void inspect(RE::StaticFunctionTag*, std::int32_t);
RE::BSFixedString inspection(RE::StaticFunctionTag*, std::int32_t);
}
