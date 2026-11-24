#pragma once
#include "PCH.h"
namespace nirn::world_runtime {
void reset(RE::StaticFunctionTag*);
void refresh(RE::StaticFunctionTag*);
void diagnoseLocations(RE::StaticFunctionTag*);
std::int32_t context(RE::StaticFunctionTag*);
std::int32_t revision(RE::StaticFunctionTag*);
std::int32_t count(RE::StaticFunctionTag*);
RE::BSFixedString entry(RE::StaticFunctionTag*, std::int32_t);
void inspect(RE::StaticFunctionTag*, std::int32_t);
RE::BSFixedString inspection(RE::StaticFunctionTag*, std::int32_t);
void initialize();
std::int32_t locationRevision(RE::StaticFunctionTag*);
std::int32_t locationCount(RE::StaticFunctionTag*);
RE::BSFixedString locationEntry(RE::StaticFunctionTag*, std::int32_t);
void inspectLocation(RE::StaticFunctionTag*, std::int32_t);
RE::BSFixedString locationInspection(RE::StaticFunctionTag*, std::int32_t);
void openMap(RE::StaticFunctionTag*, std::int32_t);
void resolveTrackingActor(RE::StaticFunctionTag*, std::int32_t, std::int32_t, std::int32_t);
std::int32_t nextTrackingRequest(RE::StaticFunctionTag*);
std::int32_t trackingResolutionStatus(RE::StaticFunctionTag*, std::int32_t);
RE::Actor* trackingResolvedActor(RE::StaticFunctionTag*, std::int32_t);
void clearTrackingResolution(RE::StaticFunctionTag*, std::int32_t);
}
