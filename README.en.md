# VoiceNormalizer

[Русский](./README.md) · **English**

A **BetterDiscord** plugin that reduces loud speech and boosts quiet speech for selected people in voice chat.

Author: **-$erent*-** · [GameModify](https://github.com/GameModify)

## Installation

1. Install [BetterDiscord](https://betterdiscord.app/).
2. Download [VoiceNormalizer.plugin.js](./VoiceNormalizer.plugin.js) and place it in the plugins folder: `%APPDATA%\BetterDiscord\plugins` on Windows.
3. Enable VoiceNormalizer in BetterDiscord settings.

## Usage

Right-click a participant and enable **Level this user's voice**. Open the plugin settings to adjust the default profile and other options.

- Selections and settings persist after restarting Discord.
- Each person's Discord volume is the starting point for adjustments.
- The plugin learns a fresh average voice level after reconnecting.
- After a loud passage, volume recovers gradually during speech and holds steady in pauses.
- Disabling processing restores the original volume, unless it has been changed manually.
- Choose **Everyone in the voice channel** to include future joins, with per-user exclusions.
- Choose **Only reduce loud voices** to keep volume at or below each person's baseline.
- The interface follows Discord's language, with manual English and Russian options.

## Profiles

| Profile | Maximum boost | Maximum reduction | Response |
| --- | --- | --- | --- |
| Soft | +30% | −35% | Gentle |
| Balanced | +100% | −55% | Moderate |
| Aggressive | +100% | −65% | Fast |

**Soft** makes smaller, smoother changes. **Balanced** is the default choice for everyday conversations. **Aggressive** responds faster and allows stronger attenuation; its maximum boost matches Balanced, while its target voice level is slightly higher.

**Use default** follows the global profile and custom settings. A per-user override keeps that person's chosen profile. **Reset learning** starts a fresh voice average without removing the selection.

Percentages refer to Discord's internal volume value relative to the original baseline, not the displayed volume slider. Reduce-only mode disables boosting for every profile. Technical controls are under **Advanced**.

This is not an instant audio limiter: the beginning of a sudden peak may pass before volume is adjusted.
