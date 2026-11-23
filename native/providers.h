#pragma once
#include <filesystem>
#include <string>
#include <vector>

namespace nirn {
// Parse provider files independently; the caller resolves plugin requirements.
std::vector<std::string> discover_providers(const std::filesystem::path& data);
}
