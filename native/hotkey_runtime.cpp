#include "PCH.h"
#include "hotkey_runtime.h"
#include "hotkey_state.h"

namespace nirn::hotkey_runtime {
namespace {
std::mutex mutex;
hotkey::State state;
int keyCode = 210;
int expectedModifiers = 0;
bool available = false;

bool pressed(int key)
{
    auto manager = RE::BSInputDeviceManager::GetSingleton();
    auto keyboard = manager ? manager->GetKeyboard() : nullptr;
    return keyboard && keyboard->IsPressed(key);
}

int modifiers()
{
    int result = 0;
    const int keys[] = {42, 54, 29, 157, 56, 184};
    for (int i = 0; i < 6; ++i) if (pressed(keys[i])) result |= 1 << i;
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
            if (id != static_cast<unsigned>(keyCode)) continue;
            if (button->IsUp()) { state.up(); continue; }
            if (!button->IsDown()) continue;
            const int observed = modifiers();
            auto ui = RE::UI::GetSingleton();
            const bool menu = !ui || ui->GameIsPaused() || ui->IsItemMenuOpen() || ui->IsModalMenuOpen();
            auto token = state.down(false, observed, expectedModifiers, available && !menu, hotkey::State::Clock::now());
            SKSE::log::info("Hotkey down key={} held={} armed={} modifiers={}/{} ready={} menu={} token={}",
                id, state.held(), state.armed(), observed, expectedModifiers, available, menu, token);
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

void message(SKSE::MessagingInterface::Message* message)
{
    if (!message) return;
    if (message->type == SKSE::MessagingInterface::kInputLoaded) {
        if (auto manager = RE::BSInputDeviceManager::GetSingleton()) manager->AddEventSink(&sink);
    }
    if (message->type == SKSE::MessagingInterface::kPreLoadGame || message->type == SKSE::MessagingInterface::kNewGame) {
        std::scoped_lock lock(mutex);
        available = false;
        state.reset(pressed(keyCode));
    }
}
}

void initialize() { SKSE::GetMessagingInterface()->RegisterListener(message); }
void configure(RE::StaticFunctionTag*, std::int32_t key, std::int32_t modifiers)
{
    std::scoped_lock lock(mutex);
    keyCode = key;
    expectedModifiers = modifiers;
    state.reset(pressed(keyCode));
}
void ready(RE::StaticFunctionTag*, bool value)
{
    std::scoped_lock lock(mutex);
    available = value;
    if (!value) state.reset(pressed(keyCode));
}
bool consume(RE::StaticFunctionTag*, std::int32_t token)
{
    std::scoped_lock lock(mutex);
    return available && state.consume(static_cast<std::uint32_t>(token), hotkey::State::Clock::now());
}
}
