# VoiceNormalizer

[Русский](./README.md) · **English**

A BetterDiscord plugin that reduces loud speech and boosts quiet speech for individual people or everyone in a voice channel. Your Discord volume slider stays under your control.

[**Download plugin**](https://github.com/GameModify/voice-normalizer/releases/latest/download/VoiceNormalizer.plugin.js) · [Releases](https://github.com/GameModify/voice-normalizer/releases) · [Settings (Russian)](./docs/SETTINGS.md) · [Report an issue](https://github.com/GameModify/voice-normalizer/issues/new)

Stable version: **1.4.0**. Author: **GameModify** · [GameModify](https://github.com/GameModify)

![VoiceNormalizer settings: everyone mode, profiles, and participant status](./docs/images/settings.png)

*Preview of the actual 1.4.0 settings controls with fictional participants. Appearance depends on your Discord theme.*

## Installation

Requires desktop Discord with BetterDiscord. The instructions below cover Windows.

1. Install [BetterDiscord](https://betterdiscord.app/).
2. [Download VoiceNormalizer.plugin.js](https://github.com/GameModify/voice-normalizer/releases/latest/download/VoiceNormalizer.plugin.js) and place it in the plugins folder. On Windows: `%APPDATA%\BetterDiscord\plugins`.
3. Enable VoiceNormalizer in BetterDiscord settings.

Only the plugin file is needed to install. Node.js, the **Source code** archives, and project files are for development. The release also includes the MIT license and `SHA256SUMS.txt` to verify downloads.

Internet is needed to download the plugin and use Discord voice. The plugin does not contact a separate server or download code at startup.

## Usage

Set a comfortable Discord volume for the person while they speak normally. Right-click them and enable **Level this user's voice**. The **VoiceNormalizer** submenu lets you choose their profile or reset learning.

Allow about two seconds of ordinary speech for initial calibration. Quieter phrases are boosted and louder phrases are reduced. If initial calibration only captures whispering or shouting, choose **Reset learning** while the person speaks normally.

For the whole channel, open the plugin settings and choose **Everyone in the voice channel**. New participants are included automatically, and you can exclude individual people. Your own voice is excluded.

- Participant selections, exclusions, and profiles persist after restarting Discord.
- Automatic correction does not move your volume slider. A manual change establishes a new baseline while preserving learning.
- After a loud passage, volume recovers gradually during speech and holds steady in pauses.
- Disabling processing restores the baseline while respecting subsequent manual changes.

The ordinary-speech reference is kept until the plugin restarts, then learned again. A zero volume setting keeps the person muted.

In **Only reduce loud voices** mode, boosting is disabled: volume stays at or below each person's baseline.

## Profiles

Start with **Balanced**.

| Profile | Correction range | Response |
| --- | --- | --- |
| Soft | ×0.65–1.3 | Gentle |
| Balanced | ×0.45–2 | Moderate |
| Aggressive | ×0.35–2 | Fast |

**Soft** suits small volume differences. **Balanced** is for everyday conversations. **Aggressive** responds faster and allows stronger attenuation. Its maximum boost matches Balanced; their correction strength and response speed differ.

**Use default** follows the global settings. A per-user profile overrides them for that person. **Reset learning** learns a fresh average voice level while keeping the selection and profile.

Click a participant list to expand it. Individual profiles are under **Individual settings** inside participant cards; detailed controls and language are under **Advanced**.

These multiply internal playback volume relative to the manual baseline; they are not slider positions or measured decibels.

## Updates and data

Download `VoiceNormalizer.plugin.js` from the [latest release](https://github.com/GameModify/voice-normalizer/releases/latest) and replace the old file in the plugins folder. BetterDiscord reloads it. Participant selections, modes, and profiles are retained.

Preferences are stored locally in `VoiceNormalizer.config.json` next to the plugin. On Windows: `%APPDATA%\BetterDiscord\plugins\VoiceNormalizer.config.json`. You can back up this file to another folder before updating. It contains user IDs and preferences; do not attach the entire file to a public issue.

When upgrading from 1.3, the old global target is no longer used: 1.4 learns each person's ordinary speech. Participant selections and other supported settings are retained. Brief calibration is needed after updating.

To roll back, disable the plugin, replace its file with one from the [required release](https://github.com/GameModify/voice-normalizer/releases), and enable it again. Close Discord before restoring a backed-up configuration file.

## Limitations and help

The plugin uses Discord statistics rather than processing audio samples, so the beginning of a sudden peak may pass before attenuation. Discord's internal methods can change; processing stays off if independent playback control is unavailable. Compatibility with elevated volumes in BetterVolume has not been separately confirmed.

If something goes wrong, [open an issue](https://github.com/GameModify/voice-normalizer/issues/new) with the plugin version, selected mode, steps to reproduce, and expected result.

[Detailed settings (Russian)](./docs/SETTINGS.md) · [Roadmap (Russian)](./docs/ROADMAP.md) · [Development (Russian)](./CONTRIBUTING.md)

## License

[MIT](./LICENSE) © 2026 GameModify.
