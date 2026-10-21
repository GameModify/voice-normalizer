# VoiceNormalizer

[Русский](./README.md) · **English**

A BetterDiscord plugin that reduces loud speech and boosts quiet speech for individual people or everyone in a voice channel.

Author: **-$erent*-** · [GameModify](https://github.com/GameModify)

## Installation

1. Install [BetterDiscord](https://betterdiscord.app/).
2. [Download VoiceNormalizer.plugin.js](https://github.com/GameModify/voice-normalizer/releases/latest/download/VoiceNormalizer.plugin.js) and place it in the plugins folder. On Windows: `%APPDATA%\BetterDiscord\plugins`.
3. Enable VoiceNormalizer in BetterDiscord settings.

You only need the plugin file. Downloading the whole repository or installing Node.js is unnecessary.

## Usage

For one person, right-click them and enable **Level this user's voice**. The **VoiceNormalizer** submenu lets you choose their profile or reset learning.

For the whole channel, open the plugin settings and choose **Everyone in the voice channel**. New participants are included automatically, and you can exclude individual people. Your own voice is excluded.

- Participant selections, exclusions, and profiles persist after restarting Discord.
- Each person's Discord volume is the baseline. A manual change establishes a new baseline and restarts learning.
- After a loud passage, volume recovers gradually during speech and holds steady in pauses.
- Disabling processing restores the baseline while respecting subsequent manual changes.

In **Only reduce loud voices** mode, boosting is disabled: volume stays at or below each person's baseline.

## Profiles

Start with **Balanced**.

| Profile | Maximum boost | Maximum reduction | Response |
| --- | --- | --- | --- |
| Soft | +30% | −35% | Gentle |
| Balanced | +100% | −55% | Moderate |
| Aggressive | +100% | −65% | Fast |

**Soft** suits small volume differences. **Balanced** is for everyday conversations. **Aggressive** responds faster and allows stronger attenuation; its maximum boost matches Balanced, while its target voice level is slightly higher.

**Use default** follows the global settings. A per-user profile overrides them for that person. **Reset learning** learns a fresh average voice level while keeping the selection and profile.

Click a participant list to expand it. Individual profiles are under **Individual settings** inside participant cards; detailed controls and language are under **Advanced**.

Percentages in the table refer to Discord's internal volume relative to the baseline, not the displayed volume slider. The plugin adjusts volume using Discord statistics, so the beginning of a sudden peak may pass before attenuation.

## Help

If something goes wrong, [open an issue](https://github.com/GameModify/voice-normalizer/issues/new) with the plugin version, selected mode, steps to reproduce, and expected result.

[Detailed settings (Russian)](./docs/SETTINGS.md) · [Roadmap (Russian)](./docs/ROADMAP.md) · [Development (Russian)](./CONTRIBUTING.md)
