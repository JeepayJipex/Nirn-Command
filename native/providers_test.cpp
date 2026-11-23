#include "providers.h"
#include <nlohmann/json.hpp>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <iostream>
namespace fs = std::filesystem;
void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
void write(const fs::path& dir, const char* name, const char* content) { std::ofstream(dir / name, std::ios::binary) << content; }
int main() {
    const auto root=fs::temp_directory_path() / ("nirn-providers-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    const auto dir=root / "SKSE/Plugins/NirnCommand/Providers";
    try {
        fs::create_directories(dir);
        write(dir,"one.json",R"({"schemaVersion":1,"provider":{"id":"alpha","name":"Alpha","requires":{"plugins":["Alpha.esp"]}},"commands":[{"id":"open","name":"Open","action":{"type":"shortcut","key":37,"modifiers":4}},{"id":"bad","name":"Bad","action":{"type":123}},{"id":"console","name":"Éclair","keywords":["magic"],"action":{"type":"console","command":"tgm"}}]})");
        write(dir,"two.json",R"({"schemaVersion":1,"provider":{"id":"beta","name":"Beta"},"commands":[{"id":"open","name":"Other","action":{"type":"console","command":"tcl"}}]})");
        write(dir,"invalid.json","{broken");
        auto entries=nirn::discover_providers(root);
        require(entries.size()==3,"independent providers or per-command recovery failed");
        bool found=false;
        for (const auto& row : entries) { auto e=nlohmann::json::parse(row); if(e["id"]=="provider:alpha:open") {found=true; require(e["action"]=="shortcut2:37:4" && e["requiredPlugins"][0]=="Alpha.esp","shortcut or requirements lost");} }
        require(found,"missing alpha command");
        write(dir,"duplicate.json",R"({"schemaVersion":1,"provider":{"id":"alpha","name":"Copy"},"commands":[{"id":"open","name":"Duplicate","action":{"type":"console","command":"tgm"}}]})");
        entries=nirn::discover_providers(root);
        require(entries.size()==2,"ambiguous IDs must be rejected");
        fs::remove_all(root);
        std::cout << "Provider isolation, invalid commands, dependencies and duplicate IDs passed\n";
        return 0;
    } catch (...) { fs::remove_all(root); throw; }
}
