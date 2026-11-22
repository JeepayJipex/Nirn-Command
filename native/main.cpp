#include "PCH.h"
#include "OpenAnimationReplacerAPI-UI.h"

namespace {
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
        api->ToggleMenu();
        return true;
    }
    bool RegisterPapyrus(RE::BSScript::IVirtualMachine* vm)
    {
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
