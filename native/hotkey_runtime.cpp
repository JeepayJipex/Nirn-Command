#include "PCH.h"
#include "hotkey_runtime.h"
#include "hotkey_state.h"
#include <array>

namespace nirn::hotkey_runtime {
namespace {
std::mutex mutex;
hotkey::State state;
int keyCode = 210;
int expectedModifiers = 0;
bool available = false;
int viewId = 0;
std::array<bool, 256> keys{};

bool physicallyPressed(int key)
{
    if (key < 0 || key >= static_cast<int>(keys.size())) return false;
    const unsigned scan = (key & 0x7f) | ((key & 0x80) ? 0xe000 : 0);
    const auto virtualKey = MapVirtualKeyW(scan, MAPVK_VSC_TO_VK_EX);
    return virtualKey && (GetAsyncKeyState(virtualKey) & 0x8000);
}

int modifiers()
{
    int result = 0;
    const int modifierKeys[] = {42, 54, 29, 157, 56, 184};
    for (int i = 0; i < 6; ++i) if (keys[modifierKeys[i]] || physicallyPressed(modifierKeys[i])) result |= 1 << i;
    return result;
}

class InputSink : public RE::BSTEventSink<RE::InputEvent*> {
public:
    RE::BSEventNotifyControl ProcessEvent(RE::InputEvent* const* events,
        RE::BSTEventSource<RE::InputEvent*>*) override
    {
        if (!events) return RE::BSEventNotifyControl::kContinue;
        for (auto event = *events; event; event = event->next) {
            auto button = event->AsButtonEvent();
            if (!button || event->GetDevice() != RE::INPUT_DEVICE::kKeyboard) continue;
            auto id = button->AsIDEvent()->GetIDCode();
            std::scoped_lock lock(mutex);
            if (id < keys.size()) {
                if (button->IsDown()) keys[id] = true;
                else if (button->IsUp()) keys[id] = false;
            }
            if (id != static_cast<unsigned>(keyCode)) continue;
            if (button->IsUp()) { state.up(); continue; }
            if (!button->IsDown()) continue;
            const int observed = modifiers();
            auto ui = RE::UI::GetSingleton();
            const bool menu = !ui || ui->GameIsPaused() || ui->IsItemMenuOpen() || ui->IsModalMenuOpen();
            auto token = state.down(false, observed, expectedModifiers, available && !menu, hotkey::State::Clock::now());
            const char* reason = token ? "accepted" : !state.armed() ? "unarmed" :
                observed != expectedModifiers ? "modifiers" : !available ? "view-unavailable" : "menu";
            SKSE::log::info("Hotkey down key={} held={} armed={} modifiers={}/{} view={} ready={} menu={} reason={} token={}",
                id, state.held(), state.armed(), observed, expectedModifiers, viewId, available, menu, reason, token);
            if (!token) continue;
            auto source = static_cast<RE::BSTEventSource<SKSE::ModCallbackEvent>*>(
                SKSE::GetMessagingInterface()->GetEventDispatcher(SKSE::MessagingInterface::Dispatcher::kModEvent));
            if (source) {
                SKSE::ModCallbackEvent callback{ "NirnCommand_Hotkey", std::to_string(token), 0.0f, nullptr };
                source->SendEvent(&callback);
            }
        }
        return RE::BSEventNotifyControl::kContinue;
    }
} sink;

}

void message(SKSE::MessagingInterface::Message* message)
{
    if (!message) return;
    if (message->type == SKSE::MessagingInterface::kInputLoaded) {
        if (auto manager = RE::BSInputDeviceManager::GetSingleton()) {
            manager->AddEventSink(&sink);
            SKSE::log::info("Hotkey input listener registered");
        } else {
            SKSE::log::error("Hotkey input listener unavailable: input manager missing");
        }
    }
    if (message->type == SKSE::MessagingInterface::kPreLoadGame || message->type == SKSE::MessagingInterface::kNewGame) {
        std::scoped_lock lock(mutex);
        available = false;
        state.reset(keys[keyCode] || physicallyPressed(keyCode));
    }
}
void configure(RE::StaticFunctionTag*, std::int32_t key, std::int32_t modifiers)
{
    std::scoped_lock lock(mutex);
    keyCode = key;
    expectedModifiers = modifiers;
    const int modifierKeys[] = {42, 54, 29, 157, 56, 184};
    for (int modifier : modifierKeys) keys[modifier] = physicallyPressed(modifier);
    state.reset(keys[keyCode] || physicallyPressed(keyCode));
    SKSE::log::info("Hotkey configured key={} modifiers={} armed={}", keyCode, expectedModifiers, state.armed());
}
void ready(RE::StaticFunctionTag*, bool value, std::int32_t view)
{
    std::scoped_lock lock(mutex);
    available = value;
    viewId = value ? view : 0;
    if (!value) state.reset(keys[keyCode] || physicallyPressed(keyCode));
    SKSE::log::info("Hotkey readiness ready={} view={}", available, viewId);
}
bool consume(RE::StaticFunctionTag*, std::int32_t token)
{
    std::scoped_lock lock(mutex);
    return available && state.consume(static_cast<std::uint32_t>(token), hotkey::State::Clock::now());
}
void recover(RE::StaticFunctionTag*)
{
    std::scoped_lock lock(mutex);
    if (!physicallyPressed(keyCode)) {
        keys[keyCode] = false;
        state.up();
    }
    const int modifierKeys[] = {42, 54, 29, 157, 56, 184};
    for (int modifier : modifierKeys) if (!physicallyPressed(modifier)) keys[modifier] = false;
}
}
