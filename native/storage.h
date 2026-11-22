#pragma once
#include <filesystem>
#include <string>
#include <vector>

namespace nirn {
// Returns 0 on success, 1 for no file, 2 for malformed/unreadable data.
int read_commands(const std::filesystem::path& file, std::string& output);
bool write_commands(const std::filesystem::path& file, const std::string& data);
bool read_hotkey(const std::filesystem::path& file, int& key, int& modifiers);
bool write_hotkey(const std::filesystem::path& file, int key, int modifiers);
std::vector<std::string> split_utf8(const std::string& data, std::size_t maxBytes);
}
