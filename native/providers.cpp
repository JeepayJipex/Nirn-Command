#include "providers.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <fstream>
#include <unordered_map>

namespace nirn {
namespace {
using json = nlohmann::json;
bool identifier(const json& value) {
    if (!value.is_string()) return false;
    const auto s = value.get<std::string>();
    return !s.empty() && s.size() <= 64 && std::all_of(s.begin(), s.end(), [](unsigned char c) {
        return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
    });
}
bool text(const json& value, std::size_t max) {
    return value.is_string() && !value.get_ref<const std::string&>().empty() && value.get_ref<const std::string&>().size() <= max;
}
bool requirements(const json& owner, json& result) {
    if (!owner.contains("requires")) return true;
    const auto& req = owner["requires"];
    if (!req.is_object() || !req.contains("plugins") || !req["plugins"].is_array()) return false;
    for (const auto& plugin : req["plugins"]) {
        if (result.size() >= 32) return false;
        if (!text(plugin, 128)) return false;
        const auto name = plugin.get<std::string>();
        if (name.find_first_of("\\/:") != std::string::npos) return false;
        result.push_back(name);
    }
    return true;
}
}
std::vector<std::string> discover_providers(const std::filesystem::path& data, std::vector<std::string>* diagnostics) {
    std::vector<std::filesystem::path> files;
    std::unordered_map<std::string, std::vector<std::string>> commands;
    std::size_t total = 0, count = 0;
    try {
        const auto dir = data / "SKSE/Plugins/NirnCommand/Providers";
        if (!std::filesystem::is_directory(dir)) return {};
        for (const auto& entry : std::filesystem::directory_iterator(dir)) {
            if (entry.is_regular_file() && entry.path().extension() == ".json") files.push_back(entry.path());
        }
        std::sort(files.begin(), files.end());
        if (files.size() > 128) { if (diagnostics) diagnostics->push_back("Provider file limit exceeded"); files.resize(128); }
        for (const auto& file : files) {
            try {
                const auto size = std::filesystem::file_size(file);
                if (size > 256 * 1024 || total + size > 2 * 1024 * 1024) { if (diagnostics) diagnostics->push_back("Provider file or scan byte limit exceeded: " + file.filename().string()); continue; }
                total += size;
                std::ifstream input(file, std::ios::binary);
                auto root = json::parse(input, nullptr, false);
                if (!root.is_object() || root.value("schemaVersion", 0) != 1 || !root.contains("provider") || !root["provider"].is_object() || !root.contains("commands") || !root["commands"].is_array()) { if (diagnostics) diagnostics->push_back("Invalid or unsupported provider: " + file.filename().string()); continue; }
                const auto& provider = root["provider"];
                if (!identifier(provider.value("id", json{})) || !text(provider.value("name", json{}), 160)) continue;
                json baseRequirements = json::array();
                if (!requirements(provider, baseRequirements)) continue;
                for (const auto& cmd : root["commands"]) {
                    if (++count > 2048) { if (diagnostics && count == 2049) diagnostics->push_back("Provider command limit exceeded"); break; }
                    try {
                    if (!cmd.is_object() || !identifier(cmd.value("id", json{})) || !text(cmd.value("name", json{}), 160) || !cmd.contains("action") || !cmd["action"].is_object()) continue;
                    auto deps = baseRequirements;
                    if (!requirements(cmd, deps)) continue;
                    const auto& action = cmd["action"];
                    std::string encoded;
                    if (action.value("type", std::string{}) == "console" && text(action.value("command", json{}), 512)) encoded = "console:" + action["command"].get<std::string>();
                    else if (action.value("type", std::string{}) == "shortcut" && action.contains("key") && action["key"].is_number_integer() && action.contains("modifiers") && action["modifiers"].is_number_integer()) {
                        auto key = action["key"].get<int>(), mask = action["modifiers"].get<int>();
                        if (key <= 0 || key >= 256 || mask < 0 || mask >= 64 || key == 42 || key == 54 || key == 29 || key == 157 || key == 56 || key == 184) continue;
                        encoded = "shortcut2:" + std::to_string(key) + ":" + std::to_string(mask);
                    } else continue;
                    std::string keywords;
                    if (cmd.contains("keywords")) {
                        if (!cmd["keywords"].is_array()) continue;
                        bool valid = true;
                        for (const auto& keyword : cmd["keywords"]) { if (!text(keyword, 128) || keywords.size() + keyword.get<std::string>().size() > 512) { valid = false; break; } keywords += keyword.get<std::string>() + " "; }
                        if (!valid) continue;
                    }
                    const auto id = "provider:" + provider["id"].get<std::string>() + ":" + cmd["id"].get<std::string>();
                    json entry = {{"id",id},{"label",cmd["name"]},{"kind","Mod"},{"action",encoded},{"keywords",keywords},{"source",provider["name"]},{"requiredPlugins",deps}};
                    auto serialized = entry.dump();
                    if (serialized.size() > 1800) continue;
                    commands[id].push_back(std::move(serialized));
                    } catch (const std::exception&) { continue; }
                }
            } catch (const std::exception& error) { if (diagnostics) diagnostics->push_back("Provider read failed: " + file.filename().string() + ": " + error.what()); continue; }
        }
    } catch (const std::exception&) { return {}; }
    std::vector<std::string> result;
    for (const auto& [id, values] : commands) {
        if (values.size() == 1) result.push_back(values.front());
        else if (diagnostics) diagnostics->push_back("Ambiguous provider command ID: " + id);
    }
    std::sort(result.begin(), result.end());
    return result;
}
}
