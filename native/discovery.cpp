#include "discovery.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cctype>
#include <fstream>
#include <unordered_map>
#include <unordered_set>

namespace nirn {
namespace {
using json = nlohmann::json;
json read_json(const std::filesystem::path& path)
{
    std::ifstream input(path, std::ios::binary);
    if (!input || std::filesystem::file_size(path) > 4 * 1024 * 1024) return {};
    auto value = json::parse(input, nullptr, false, true);
    return value.is_discarded() ? json{} : value;
}
std::string field(const json& value, const char* name)
{
    auto it = value.find(name);
    return it != value.end() && it->is_string() ? it->get<std::string>() : "";
}
bool valid_component(const std::string& value)
{
    return !value.empty() && value.size() <= 128 && value != "." && value != ".." &&
        value.find_first_of("\\/:*?\"<>|") == std::string::npos;
}
std::string fold(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return value;
}
}
std::vector<std::string> discover_mcm(const std::filesystem::path& data)
{
    std::vector<std::string> out;
    try {
        auto mappings = read_json(data / "MCM" / "Settings" / "keybinds.json");
        if (!mappings.is_object() || !mappings.contains("keybinds") || !mappings["keybinds"].is_array()) return out;
        std::unordered_map<std::string, json> files;
        std::unordered_set<std::string> emitted;
        for (const auto& mapping : mappings["keybinds"]) {
            if (!mapping.is_object()) continue;
            const auto mod = field(mapping, "modName"), id = field(mapping, "id");
            if (!valid_component(mod) || id.empty() || id.size() > 128 || !mapping.contains("keycode") || !mapping["keycode"].is_number_integer()) continue;
            const auto key = mapping["keycode"].get<int>();
            if (key <= 0 || key >= 256) continue;
            const auto identity = fold(mod) + "|" + fold(id);
            if (emitted.contains(identity)) continue;
            auto it = files.find(mod);
            if (it == files.end()) it = files.emplace(mod, read_json(data / "MCM" / "Config" / std::filesystem::u8path(mod) / "keybinds.json")).first;
            const auto& config = it->second;
            if (!config.is_object() || fold(field(config, "modName")) != fold(mod) || !config.contains("keybinds") || !config["keybinds"].is_array()) continue;
            const json* found = nullptr;
            for (const auto& binding : config["keybinds"]) {
                if (!binding.is_object() || field(binding, "id") != id || !binding.contains("action") || !binding["action"].is_object()) continue;
                if (found) { found = nullptr; break; } // Ambiguous definitions are not actions.
                found = &binding;
            }
            if (!found) continue;
            const auto& action = (*found)["action"];
            const auto type = field(action, "type");
            bool valid = (type == "CallFunction" && !field(action,"form").empty() && !field(action,"function").empty()) ||
                (type == "CallGlobalFunction" && !field(action,"script").empty() && !field(action,"function").empty()) ||
                (type == "RunConsoleCommand" && !field(action,"command").empty()) ||
                (type == "SendEvent" && !field(action,"form").empty() && !field(action,"eventName").empty());
            if (!valid) continue;
            auto label = field(*found, "desc");
            if (label.empty() || label[0] == '$' || label.size() > 160) label = id;
            json entry = {{"id", "mcm:" + mod + ":" + id}, {"label", mod + " — " + label}, {"kind", "Mod"},
                {"action", "shortcut2:" + std::to_string(key) + ":0"}, {"detail", "MCM Helper mapping · simulated key · activation unverified"},
                {"source", "MCM/Settings/keybinds.json + MCM/Config/" + mod + "/keybinds.json"}, {"confidence", "configured association"}};
            auto serialized = entry.dump(-1, ' ', false, json::error_handler_t::replace);
            if (serialized.size() > 1800) continue;
            out.push_back(std::move(serialized));
            emitted.insert(identity);
            if (out.size() >= 512) break;
        }
    } catch (const std::exception&) {
        // Retain no partial result when a file operation fails.
        return {};
    }
    return out;
}
}
