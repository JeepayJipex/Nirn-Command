#include "storage.h"
#include <nlohmann/json.hpp>
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <algorithm>
#include <fstream>
#include <iterator>

namespace nirn {
namespace {
constexpr std::size_t limit = 256 * 1024;
bool valid(const std::string& data)
{
    if (data.size() > limit) return false;
    auto parsed = nlohmann::json::parse(data, nullptr, false);
    return parsed.is_object() && parsed.contains("version") && parsed["version"].is_number_integer() && parsed["version"] == 1 && parsed.contains("commands") && parsed["commands"].is_array();
}
}
int read_commands(const std::filesystem::path& file, std::string& output)
{
    try {
        if (!std::filesystem::exists(file)) return 1;
        if (std::filesystem::file_size(file) > limit) return 2;
        std::ifstream input(file, std::ios::binary);
        if (!input) return 2;
        std::string data{std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
        if (input.bad() || !valid(data)) return 2;
        output=std::move(data);
        return 0;
    } catch (const std::exception&) { return 2; }
}
namespace {
bool write_atomic(const std::filesystem::path& file, const std::string& data)
{
    try {
        std::filesystem::create_directories(file.parent_path());
        auto temp=file; temp += L".tmp";
        {
            std::ofstream out(temp, std::ios::binary | std::ios::trunc);
            if (!out) return false;
            out.write(data.data(), static_cast<std::streamsize>(data.size()));
            out.flush();
            if (!out) return false;
        }
        return MoveFileExW(temp.c_str(), file.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
    } catch (const std::exception&) { return false; }
}
bool valid_hotkey(int key, int modifiers)
{
    return key>0 && key<256 && modifiers>=0 && modifiers<64 && key!=1 && key!=201 &&
        key!=42 && key!=54 && key!=29 && key!=157 && key!=56 && key!=184;
}
}
bool write_commands(const std::filesystem::path& file, const std::string& data)
{
    return valid(data) && write_atomic(file,data);
}
bool read_hotkey(const std::filesystem::path& file, int& key, int& modifiers)
{
    try {
        std::ifstream input(file,std::ios::binary);
        if (!input || std::filesystem::file_size(file)>4096) return false;
        auto data=nlohmann::json::parse(input,nullptr,false);
        if (!data.is_object() || !data.contains("version") || data["version"]!=1 ||
            !data.contains("key") || !data["key"].is_number_integer() ||
            !data.contains("modifiers") || !data["modifiers"].is_number_integer()) return false;
        auto candidate=data["key"].get<int>(), mask=data["modifiers"].get<int>();
        if (!valid_hotkey(candidate,mask)) return false;
        key=candidate; modifiers=mask; return true;
    } catch (const std::exception&) { return false; }
}
bool write_hotkey(const std::filesystem::path& file, int key, int modifiers)
{
    if (!valid_hotkey(key,modifiers)) return false;
    return write_atomic(file,nlohmann::json({{"version",1},{"key",key},{"modifiers",modifiers}}).dump());
}
std::vector<std::string> split_utf8(const std::string& data, std::size_t maxBytes)
{
    std::vector<std::string> result;
    for (std::size_t start=0; start<data.size();) {
        auto end=(std::min)(start+maxBytes, data.size());
        while (end<data.size() && end>start && (static_cast<unsigned char>(data[end]) & 0xc0) == 0x80) --end;
        if (end==start) return {};
        result.push_back(data.substr(start,end-start));
        start=end;
    }
    return result;
}
}
