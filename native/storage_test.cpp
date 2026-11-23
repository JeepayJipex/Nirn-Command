#include "storage.h"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
namespace fs=std::filesystem;
void require(bool ok,const char* why) {if(!ok) throw std::runtime_error(why);}
int main()
{
    const auto root=fs::temp_directory_path()/("nirn-storage-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    const auto file=root/"commands.json";
    try {
        std::string out;require(nirn::read_commands(file,out)==1,"missing file");
        const std::string original=R"({"version":1,"commands":[{"id":"user:one","label":"Épée 😀"}]})";
        require(nirn::write_commands(file,original),"initial write");
        require(nirn::read_commands(file,out)==0 && out==original,"unicode readback");
        require(!nirn::write_commands(file,R"({"version":1,"commands":false})"),"reject invalid payload");
        require(nirn::read_commands(file,out)==0 && out==original,"invalid write replaced prior data");
        const auto overrideFile=root/"overrides.json";
        const std::string overrides=R"({"version":1,"overrides":{"provider:example:open":{"hidden":true,"action":"shortcut2:37:4"}}})";
        require(nirn::read_overrides(overrideFile,out)==1,"missing overrides file");
        require(nirn::write_overrides(overrideFile,overrides),"write overrides");
        require(nirn::read_overrides(overrideFile,out)==0 && out==overrides,"overrides readback");
        require(!nirn::write_overrides(overrideFile,R"({"version":1,"overrides":[]})"),"reject invalid overrides");
        require(nirn::read_overrides(overrideFile,out)==0 && out==overrides,"invalid overrides replaced prior data");
        require(nirn::read_commands(file,out)==0 && out==original,"overrides changed commands");
        auto chunks=nirn::split_utf8(original,8);std::string joined;
        for(const auto& chunk:chunks) {require(chunk.size()<=8,"chunk size");joined+=chunk;}
        require(joined==original,"chunk data changed");
        std::string longText;
        for (int i=0; i<500; ++i) longText += "É😀";
        auto longChunks=nirn::split_utf8(longText,800);
        require(longChunks.size()>1,"long entry was not fragmented");
        joined.clear();
        for(const auto& chunk:longChunks) {
            require(chunk.size()<=800,"oversized UTF-8 fragment");
            require((static_cast<unsigned char>(chunk.front()) & 0xc0)!=0x80,"fragment begins inside a UTF-8 character");
            joined+=chunk;
        }
        require(joined==longText,"long UTF-8 entry changed");
        std::ofstream(file,std::ios::binary|std::ios::trunc)<<"bad";
        require(nirn::read_commands(file,out)==2,"corruption accepted");
        int key=0, modifiers=0;
        const auto shortcut=root/"hotkey.json";
        require(nirn::write_hotkey(shortcut,37,34),"write opening shortcut");
        require(nirn::read_hotkey(shortcut,key,modifiers) && key==37 && modifiers==34,"opening shortcut readback");
        require(!nirn::write_hotkey(shortcut,201,0),"reserved opening key accepted");
        require(nirn::read_hotkey(shortcut,key,modifiers) && key==37 && modifiers==34,"failed write changed opening key");
        fs::remove_all(root);std::cout<<"Atomic command storage and UTF-8 chunks passed\n";return 0;
    } catch(const std::exception& e) {fs::remove_all(root);std::cerr<<e.what()<<'\n';return 1;}
}
