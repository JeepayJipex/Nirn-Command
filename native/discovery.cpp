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
std::vector<std::string> discover_oar(const std::filesystem::path& data)
{
    std::ifstream input(data / "SKSE/Plugins/OpenAnimationReplacer.ini", std::ios::binary);
    if (!input) return {};
    bool inUI=false; std::unordered_map<std::string,std::string> fields;
    auto trim=[](std::string value) {
        const auto first=value.find_first_not_of(" \t\r\n");
        if (first==std::string::npos) return std::string{};
        return value.substr(first,value.find_last_not_of(" \t\r\n")-first+1);
    };
    std::string line;
    while (std::getline(input,line)) {
        auto comment=line.find_first_of(";#"); if(comment!=std::string::npos) line.erase(comment);
        line=trim(line); if(line.empty()) continue;
        if(line.front()=='[' && line.back()==']') {inUI=fold(trim(line.substr(1,line.size()-2)))=="ui";continue;}
        if(!inUI) continue;
        auto eq=line.find('='); if(eq==std::string::npos) continue;
        fields[fold(trim(line.substr(0,eq)))]=fold(trim(line.substr(eq+1)));
    }
    if(fields["benableui"]!="true" && fields["benableui"]!="1") return {};
    const auto keyText=fields["utoggleuikey"];
    if(keyText.empty() || keyText.size()>3 || !std::all_of(keyText.begin(),keyText.end(),[](unsigned char c){return std::isdigit(c);})) return {};
    int key=std::stoi(keyText), mask=0;
    if(key<=0 || key>=256 || key==42 || key==54 || key==29 || key==157 || key==56 || key==184) return {};
    for(const auto& [name,bit] : {std::pair{"utoggleuikeyshift",1},std::pair{"utoggleuikeyctrl",4},std::pair{"utoggleuikeyalt",16}}) {
        if(fields[name]!="0" && fields[name]!="1") return {};
        if(fields[name]=="1") mask|=bit;
    }
    json entry={{"id","oar:configured"},{"label","Open Animation Replacer — configured shortcut"},{"kind","Mod"},
        {"action","shortcut2:"+std::to_string(key)+":"+std::to_string(mask)},
        {"detail","OAR INI · simulated key · reception unverified"},
        {"source","SKSE/Plugins/OpenAnimationReplacer.ini [UI]"},{"confidence","configuration only"}};
    return {entry.dump()};
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
