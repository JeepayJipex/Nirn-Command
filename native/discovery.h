#pragma once
#include <filesystem>
#include <string>
#include <vector>

namespace nirn {
// Reads the MO2 virtual Data directory. Keys without a matching declared action are excluded.
std::vector<std::string> discover_mcm(const std::filesystem::path& data);
}
