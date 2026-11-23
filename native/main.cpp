#include "PCH.h"

#include "discovery.h"
#include "providers.h"
#include "storage.h"
#include "world_runtime.h"
#include <nlohmann/json.hpp>
#include <charconv>
#include <atomic>
#include <thread>

namespace {
    std::filesystem::path DataDirectory()
    {
        std::wstring path(32768, L'\0');
        const auto length=GetModuleFileNameW(nullptr,path.data(),static_cast<DWORD>(path.size()));
        if (!length || length >= path.size()) return {};
        path.resize(length);
        return std::filesystem::path(path).parent_path() / "Data";
    }
    const auto dataDirectory=DataDirectory();
    bool IsHandSpell(RE::StaticFunctionTag*, RE::SpellItem* spell)
    {
        if (!spell || spell->GetSpellType() != RE::MagicSystem::SpellType::kSpell) return false;
        const auto casting = spell->GetCastingType();
        return casting == RE::MagicSystem::CastingType::kFireAndForget ||
               casting == RE::MagicSystem::CastingType::kConcentration;
    }
    std::vector<RE::TESForm*> InventoryForms(RE::StaticFunctionTag*, RE::Actor* actor)
    {
        std::vector<RE::TESForm*> forms;
        if (!actor) return forms;
        for (const auto& [form, count] : actor->GetInventoryCounts()) {
            if (form && count > 0 && (form->Is(RE::FormType::Weapon) ||
                form->Is(RE::FormType::Armor) || form->Is(RE::FormType::AlchemyItem))) {
                forms.push_back(form);
            }
        }
        return forms;
    }
    RE::BSFixedString CatalogEntry(RE::StaticFunctionTag*, RE::BSFixedString type,
        RE::BSFixedString token, RE::BSFixedString id, RE::BSFixedString name)
    {
        nlohmann::json entry = {type.c_str(), token.c_str(), id.c_str(), name.c_str()};
        return entry.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
    }
    std::vector<RE::BSFixedString> CatalogFragments(RE::StaticFunctionTag*, RE::BSFixedString row)
    {
        std::vector<RE::BSFixedString> result;
        for (const auto& part : nirn::split_utf8(row.c_str(), 800)) result.emplace_back(part);
        return result;
    }
    std::mutex hotkeyMutex;
    const auto hotkeyFile = dataDirectory.empty() ? std::filesystem::path{} : dataDirectory / "SKSE/Plugins/NirnCommand/hotkey.json";
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
        return !hotkeyFile.empty() && nirn::write_hotkey(hotkeyFile,key,modifiers);
    }
    std::mutex commandsMutex;
    std::vector<std::string> commandChunks;
    std::string commandWrite;
    bool commandOverflow = false;
    const auto commandFile = dataDirectory.empty() ? std::filesystem::path{} : dataDirectory / "SKSE/Plugins/NirnCommand/commands.json";
    std::int32_t LoadCommands(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(commandsMutex);
        commandChunks.clear();
        std::string data;
        if (commandFile.empty()) return -2;
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
        return !commandFile.empty() && !commandOverflow && nirn::write_commands(commandFile,commandWrite);
    }
    std::mutex overridesMutex;
    std::vector<std::string> overridesChunks;
    std::string overridesWrite;
    bool overridesOverflow = false;
    const auto overridesFile = dataDirectory.empty() ? std::filesystem::path{} : dataDirectory / "SKSE/Plugins/NirnCommand/overrides.json";
    std::int32_t LoadOverrides(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(overridesMutex);
        overridesChunks.clear();
        std::string data;
        if (overridesFile.empty()) return -2;
        auto result = nirn::read_overrides(overridesFile, data);
        if (result == 1) return -1;
        if (result != 0) return -2;
        overridesChunks = nirn::split_utf8(data, 480);
        return overridesChunks.empty() && !data.empty() ? -2 : static_cast<std::int32_t>(overridesChunks.size());
    }
    RE::BSFixedString OverridesChunk(RE::StaticFunctionTag*, std::int32_t index)
    {
        std::scoped_lock lock(overridesMutex);
        if (index < 0 || static_cast<std::size_t>(index) >= overridesChunks.size()) return "";
        return overridesChunks[index];
    }
    void BeginOverridesWrite(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(overridesMutex);
        overridesWrite.clear(); overridesOverflow = false;
    }
    bool AppendOverridesChunk(RE::StaticFunctionTag*, RE::BSFixedString chunk)
    {
        std::scoped_lock lock(overridesMutex);
        std::string_view value(chunk.c_str());
        if (value.size() > 480 || overridesWrite.size() + value.size() > 256 * 1024) { overridesOverflow = true; return false; }
        overridesWrite.append(value);
        return true;
    }
    bool CommitOverridesWrite(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(overridesMutex);
        return !overridesFile.empty() && !overridesOverflow && nirn::write_overrides(overridesFile, overridesWrite);
    }
    std::mutex discoveryMutex;
    std::vector<std::string> discoveryEntries;
    std::vector<std::string> discoveryTransfer;
    std::atomic_bool discoveryRunning{false};
    std::atomic<std::int32_t> discoveryRevision{0};
    void MarkBoundPapyrus(std::string& serialized)
    {
        auto entry=nlohmann::json::parse(serialized,nullptr,false);
        if (!entry.is_object() || !entry.contains("targetForm") || !entry["targetForm"].is_string() ||
            !entry.contains("targetScript") || !entry["targetScript"].is_string()) return;
        const auto formSpec=entry["targetForm"].get<std::string>();
        const auto script=entry["targetScript"].get<std::string>();
        const auto separator=formSpec.find('|');
        if (separator==std::string::npos || !separator || script.empty()) return;
        auto formId=formSpec.substr(separator+1);
        if (formId.starts_with("0x") || formId.starts_with("0X")) formId.erase(0,2);
        std::uint32_t localId=0;
        const auto parsed=std::from_chars(formId.data(),formId.data()+formId.size(),localId,16);
        if (parsed.ec!=std::errc{} || parsed.ptr!=formId.data()+formId.size()) return;
        auto data=RE::TESDataHandler::GetSingleton();
        auto vm=RE::BSScript::Internal::VirtualMachine::GetSingleton();
        if (!data || !vm) return;
        auto form=data->LookupForm(localId,formSpec.substr(0,separator));
        auto policy=vm->GetObjectHandlePolicy();
        if (!form || !policy) return;
        auto handle=policy->GetHandleForObject(form->GetFormType(),form);
        RE::BSTSmartPointer<RE::BSScript::Object> object;
        if (vm->FindBoundObject(handle,script.c_str(),object) && object) {
            entry["detail"]="MCM Helper · Papyrus target loaded · simulated key";
            entry["confidence"]="Papyrus target loaded; key reception unverified";
            serialized=entry.dump(-1,' ',false,nlohmann::json::error_handler_t::replace);
        }
    }
    void RefreshDiscovery(RE::StaticFunctionTag*)
    {
        if (dataDirectory.empty() || discoveryRunning.exchange(true)) return;
        try {
            std::thread([] {
                try {
                    auto entries = nirn::discover_mcm(dataDirectory);
                    std::vector<std::string> diagnostics;
                    auto providers = nirn::discover_providers(dataDirectory, &diagnostics);
                    for (const auto& diagnostic : diagnostics) SKSE::log::warn("{}", diagnostic);
                    entries.insert(entries.end(), providers.begin(), providers.end());

                    std::scoped_lock lock(discoveryMutex);
                    discoveryEntries = std::move(entries);
                    ++discoveryRevision;
                } catch (const std::exception& error) {
                    SKSE::log::error("Discovery failed: {}", error.what());
                }
                discoveryRunning = false;
            }).detach();
        } catch (const std::exception& error) {
            discoveryRunning = false;
            SKSE::log::error("Could not start discovery: {}", error.what());
        }
    }
    std::int32_t DiscoveryRevision(RE::StaticFunctionTag*) { return discoveryRevision.load(); }
    std::int32_t DiscoveryCount(RE::StaticFunctionTag*)
    {
        std::scoped_lock lock(discoveryMutex);
        discoveryTransfer = discoveryEntries;
        return static_cast<std::int32_t>(discoveryTransfer.size());
    }
    RE::BSFixedString DiscoveryEntry(RE::StaticFunctionTag*, std::int32_t index)
    {
        std::string entry;
        {
            std::scoped_lock lock(discoveryMutex);
            if (index < 0 || static_cast<std::size_t>(index) >= discoveryTransfer.size()) return "";
            entry = discoveryTransfer[index];
        }
        MarkBoundPapyrus(entry);
        auto parsed = nlohmann::json::parse(entry, nullptr, false);
        if (parsed.is_object() && parsed.contains("requiredPlugins") && parsed["requiredPlugins"].is_array()) {
            auto handler = RE::TESDataHandler::GetSingleton();
            bool available = handler != nullptr;
            for (const auto& plugin : parsed["requiredPlugins"]) {
                if (!plugin.is_string() || !handler ||
                    (!handler->LookupLoadedModByName(plugin.get<std::string>()) &&
                     !handler->LookupLoadedLightModByName(plugin.get<std::string>()))) {
                    available = false;
                    break;
                }
            }
            parsed["requirementsMet"] = available;
            entry = parsed.dump();
        }
        return entry;
    }
    bool RegisterPapyrus(RE::BSScript::IVirtualMachine* vm)
    {
        vm->RegisterFunction("WorldReset", "NirnCommandNative", nirn::world_runtime::reset);
        vm->RegisterFunction("WorldRefresh", "NirnCommandNative", nirn::world_runtime::refresh);
        vm->RegisterFunction("WorldContext", "NirnCommandNative", nirn::world_runtime::context);
        vm->RegisterFunction("WorldRevision", "NirnCommandNative", nirn::world_runtime::revision);
        vm->RegisterFunction("WorldCount", "NirnCommandNative", nirn::world_runtime::count);
        vm->RegisterFunction("WorldEntry", "NirnCommandNative", nirn::world_runtime::entry);
        vm->RegisterFunction("WorldInspect", "NirnCommandNative", nirn::world_runtime::inspect);
        vm->RegisterFunction("WorldInspection", "NirnCommandNative", nirn::world_runtime::inspection);
        vm->RegisterFunction("CatalogFragments", "NirnCommandNative", CatalogFragments);
        vm->RegisterFunction("CatalogEntry", "NirnCommandNative", CatalogEntry);
        vm->RegisterFunction("InventoryForms", "NirnCommandNative", InventoryForms);
        vm->RegisterFunction("IsHandSpell", "NirnCommandNative", IsHandSpell);
        vm->RegisterFunction("GetHotkey", "NirnCommandNative", GetHotkey);
        vm->RegisterFunction("SetHotkey", "NirnCommandNative", SetHotkey);
        vm->RegisterFunction("LoadCommands", "NirnCommandNative", LoadCommands);
        vm->RegisterFunction("CommandsChunk", "NirnCommandNative", CommandsChunk);
        vm->RegisterFunction("BeginCommandsWrite", "NirnCommandNative", BeginCommandsWrite);
        vm->RegisterFunction("AppendCommandsChunk", "NirnCommandNative", AppendCommandsChunk);
        vm->RegisterFunction("CommitCommandsWrite", "NirnCommandNative", CommitCommandsWrite);
        vm->RegisterFunction("LoadOverrides", "NirnCommandNative", LoadOverrides);
        vm->RegisterFunction("OverridesChunk", "NirnCommandNative", OverridesChunk);
        vm->RegisterFunction("BeginOverridesWrite", "NirnCommandNative", BeginOverridesWrite);
        vm->RegisterFunction("AppendOverridesChunk", "NirnCommandNative", AppendOverridesChunk);
        vm->RegisterFunction("CommitOverridesWrite", "NirnCommandNative", CommitOverridesWrite);
        vm->RegisterFunction("RefreshDiscovery", "NirnCommandNative", RefreshDiscovery);
        vm->RegisterFunction("DiscoveryRevision", "NirnCommandNative", DiscoveryRevision);
        vm->RegisterFunction("DiscoveryCount", "NirnCommandNative", DiscoveryCount);
        vm->RegisterFunction("DiscoveryEntry", "NirnCommandNative", DiscoveryEntry);
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
