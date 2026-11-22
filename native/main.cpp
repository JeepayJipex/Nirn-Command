#include "PCH.h"
#include "OpenAnimationReplacerAPI-UI.h"
#include "discovery.h"
#include "storage.h"

namespace {
    std::mutex hotkeyMutex;
    const std::filesystem::path hotkeyFile = "Data/SKSE/Plugins/NirnCommand/hotkey.json";
    std::int32_t GetHotkey(RE::StaticFunctionTag*, std::int32_t part)
    {
        std::scoped_lock lock(hotkeyMutex);
        int key=210, modifiers=0;
        nirn::read_hotkey(hotkeyFile,key,modifiers);
        return part==0 ? key : modifiers;
    }
    bool SetHotkey(RE::StaticFunctionTag*, std::int32_t key, std::int32_t modifiers)
    {
        std::scoped_lock lock(hotkeyMutex);
        return nirn::write_hotkey(hotkeyFile,key,modifiers);
    }
    std::mutex commandsMutex;
    std::vector<std::string> commandChunks;
    std::string commandWrite;
    bool commandOverflow = false;
    const std::filesystem::path commandFile = "Data/SKSE/Plugins/NirnCommand/commands.json";
    std::int32_t LoadCommands(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(commandsMutex);
        commandChunks.clear();
        std::string data;
        auto result=nirn::read_commands(commandFile, data);
        if (result == 1) return -1;
        if (result != 0) return -2;
        commandChunks=nirn::split_utf8(data, 480);
        return commandChunks.empty() && !data.empty() ? -2 : static_cast<std::int32_t>(commandChunks.size());
    }
    RE::BSFixedString CommandsChunk(RE::StaticFunctionTag*, std::int32_t index)
    {
        std::scoped_lock lock(commandsMutex);
        if (index < 0 || static_cast<std::size_t>(index) >= commandChunks.size()) return "";
        return commandChunks[index];
    }
    void BeginCommandsWrite(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(commandsMutex);
        commandWrite.clear(); commandOverflow=false;
    }
    bool AppendCommandsChunk(RE::StaticFunctionTag*, RE::BSFixedString chunk)
    {
        std::scoped_lock lock(commandsMutex);
        std::string_view value(chunk.c_str());
        if (value.size()>480 || commandWrite.size()+value.size()>256*1024) { commandOverflow=true; return false; }
        commandWrite.append(value);
        return true;
    }
    bool CommitCommandsWrite(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(commandsMutex);
        return !commandOverflow && nirn::write_commands(commandFile,commandWrite);
    }
    std::mutex discoveryMutex;
    std::vector<std::string> discoveryEntries;
    void RefreshDiscovery(RE::StaticFunctionTag*)
    {
        auto entries = nirn::discover_mcm("Data");
        auto oar = nirn::discover_oar("Data");
        entries.insert(entries.end(), oar.begin(), oar.end());
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
        vm->RegisterFunction("GetHotkey", "NirnCommandNative", GetHotkey);
        vm->RegisterFunction("SetHotkey", "NirnCommandNative", SetHotkey);
        vm->RegisterFunction("LoadCommands", "NirnCommandNative", LoadCommands);
        vm->RegisterFunction("CommandsChunk", "NirnCommandNative", CommandsChunk);
        vm->RegisterFunction("BeginCommandsWrite", "NirnCommandNative", BeginCommandsWrite);
        vm->RegisterFunction("AppendCommandsChunk", "NirnCommandNative", AppendCommandsChunk);
        vm->RegisterFunction("CommitCommandsWrite", "NirnCommandNative", CommitCommandsWrite);
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
