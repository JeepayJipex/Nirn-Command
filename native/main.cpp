#include "PCH.h"
#include "OpenAnimationReplacerAPI-UI.h"
#include "discovery.h"

namespace {
    std::mutex discoveryMutex;
    std::vector<std::string> discoveryEntries;
    void RefreshDiscovery(RE::StaticFunctionTag*)
    {
        auto entries = nirn::discover_mcm("Data");
        std::scoped_lock lock(discoveryMutex);
        discoveryEntries = std::move(entries);
    }
    std::int32_t DiscoveryCount(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(discoveryMutex);
        return static_cast<std::int32_t>(discoveryEntries.size());
    }
    RE::BSFixedString DiscoveryEntry(RE::StaticFunctionTag*, std::int32_t index)
    {
        std::scoped_lock lock(discoveryMutex);
        if (index < 0 || static_cast<std::size_t>(index) >= discoveryEntries.size()) return "";
        return discoveryEntries[index];
    }
    OAR_API::UI::IUIInterface* OarUI()
    {
        auto module = GetModuleHandleA("OpenAnimationReplacer.dll");
        if (!module) return nullptr;
        auto request = reinterpret_cast<OAR_API::UI::_RequestPluginAPI_UI>(GetProcAddress(module, "RequestPluginAPI_UI"));
        if (!request) return nullptr;
        auto plugin = SKSE::PluginDeclaration::GetSingleton();
        return request(OAR_API::UI::InterfaceVersion::V3, plugin->GetName().data(), plugin->GetVersion());
    }
    bool IsOarAvailable(RE::StaticFunctionTag*) { return OarUI() != nullptr; }
    bool ToggleOar(RE::StaticFunctionTag*)
    {
        auto api = OarUI();
        if (!api) return false;
        SKSE::GetTaskInterface()->AddTask([api]() { api->ToggleMenu(); });
        return true;
    }
    bool RegisterPapyrus(RE::BSScript::IVirtualMachine* vm)
    {
        vm->RegisterFunction("RefreshDiscovery", "NirnCommandNative", RefreshDiscovery);
        vm->RegisterFunction("DiscoveryCount", "NirnCommandNative", DiscoveryCount);
        vm->RegisterFunction("DiscoveryEntry", "NirnCommandNative", DiscoveryEntry);
        vm->RegisterFunction("IsOarAvailable", "NirnCommandNative", IsOarAvailable);
        vm->RegisterFunction("ToggleOar", "NirnCommandNative", ToggleOar);
        return true;
    }
}

SKSEPluginLoad(const SKSE::LoadInterface* skse)
{
    SKSE::Init(skse);
    auto logDir = SKSE::log::log_directory();
    if (logDir) {
        auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>((*logDir / "NirnCommandNative.log").string(), true);
        spdlog::set_default_logger(std::make_shared<spdlog::logger>("NirnCommandNative", std::move(sink)));
        spdlog::set_level(spdlog::level::info);
        spdlog::flush_on(spdlog::level::info);
    }
    SKSE::log::info("Nirn Command native initializing");
    return SKSE::GetPapyrusInterface()->Register(RegisterPapyrus);
}
