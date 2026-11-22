#include "discovery.h"
#include <nlohmann/json.hpp>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>

namespace fs = std::filesystem;
void write(const fs::path& path, const std::string& value) { fs::create_directories(path.parent_path()); std::ofstream(path, std::ios::binary) << value; }
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
int main()
{
    const auto root=fs::temp_directory_path() / ("nirn-discovery-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    try {
        write(root / "MCM/Settings/keybinds.json", R"({"keybinds":[
          {"modName":"Example","id":"open","keycode":37},
          {"modName":"Example","id":"unmapped","keycode":20},
          {"modName":"Example","id":"broken","keycode":22},
          {"modName":"Example","id":"open","keycode":37},
          {"modName":"../outside","id":"open","keycode":20},
          {"modName":"Example","id":"unbound","keycode":0}]})");
        write(root / "MCM/Config/Example/keybinds.json", R"({"modName":"Example","keybinds":[
          {"id":"open","desc":"Open menu","action":{"type":"CallFunction","form":"Example.esp|800","function":"Open"}},
          {"id":"broken","desc":"No action","action":{"type":"CallFunction"}},
          {"id":"unbound","desc":"Not mapped","action":{"type":"RunConsoleCommand","command":"tgm"}}]})");
        write(root / "SKSE/Plugins/OpenAnimationReplacer.ini", "[UI]\nbEnableUI=true\nuToggleUIKey=45\nuToggleUIKeyShift=1\nuToggleUIKeyCtrl=0\nuToggleUIKeyAlt=1\n");
        auto oar=nirn::discover_oar(root);
        require(oar.size()==1 && nlohmann::json::parse(oar[0])["action"]=="shortcut2:45:17", "OAR configured mapping");
        write(root / "SKSE/Plugins/OpenAnimationReplacer.ini", "[UI]\nuToggleUIKey=45\n");
        require(nirn::discover_oar(root).empty(), "incomplete OAR settings must not invent a binding");
        auto entries=nirn::discover_mcm(root);
        require(entries.size()==1,"only mapped declared actions should appear");
        auto entry=nlohmann::json::parse(entries[0]);
        require(entry["id"]=="mcm:Example:open", "wrong identity");
        require(entry["action"]=="shortcut2:37:0", "wrong key");
        require(entry["source"].get<std::string>().find("keybinds.json")!=std::string::npos,"missing source");
        write(root / "MCM/Settings/keybinds.json", "invalid");
        require(nirn::discover_mcm(root).empty(),"malformed settings must not create actions");
        fs::remove_all(root);
        std::cout << "MCM discovery rejects unbound, invalid, duplicate and undeclared keys\n";
        return 0;
    } catch (const std::exception& e) {
        fs::remove_all(root);
        std::cerr << e.what() << '\n';
        return 1;
    }
}
