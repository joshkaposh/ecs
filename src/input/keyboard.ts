import { EventReader } from "../ecs";
import { ResMut } from "../ecs/change_detection";
import { ButtonInput, ButtonState } from "./button_input";

export type Key = keyof typeof Key;
export const Key = {

} as const;

// export const KeyCode = {
//     /// The `Alt` (Alternative) key.
//     ///
//     /// This key enables the alternate modifier function for interpreting concurrent or subsequent
//     /// keyboard input. This key value is also used for the Apple <kbd>Option</kbd> key.
//     Alt: 'Alt',
//     /// The Alternate Graphics (<kbd>AltGr</kbd> or <kbd>AltGraph</kbd>) key.
//     ///
//     /// This key is used enable the ISO Level 3 shift modifier (the standard `Shift` key is the
//     /// level 2 modifier).
//     AltGraph: 'AltGraph',
//     CapsLock: 'CapsLock',
//     /// The `Control` or `Ctrl` key.
//     ///
//     /// Used to enable control modifier function for interpreting concurrent or subsequent keyboard
//     /// input.
//     Control: 'Control',
//     /// The Function switch `Fn` key. Activating this key simultaneously with another key changes
//     /// that key’s value to an alternate character or function. This key is often handled directly
//     /// in the keyboard hardware and does not usually generate key events.
//     Fn: 'Fn',
//     /// The Function-Lock (`FnLock` or `F-Lock`) key. Activating this key switches the mode of the
//     /// keyboard to changes some keys' values to an alternate character or function. This key is
//     /// often handled directly in the keyboard hardware and does not usually generate key events.
//     FnLock: 'FnLock',
//     /// The `NumLock` or Number Lock key. Used to toggle numpad mode function for interpreting
//     /// subsequent keyboard input.
//     NumLock: 'NumLock',
//     ScrollLock: 'ScrollLock',
//     /// Used to enable shift modifier function for interpreting concurrent or subsequent keyboard
//     /// input.
//     Shift: 'Shift',
//     /// The Symbol modifier key (used on some virtual keyboards).
//     Symbol: 'Symbol',
//     /// The SymbolLock key, only on web.
//     SymbolLock: 'SymbolLock',
//     /// Legacy modifier key. Also called "Super" in certain places.
//     Meta: 'Meta',

//     /// Legacy modifier key.
//     Hyper: 'Hyper',
//     /// Used to enable "super" modifier function for interpreting concurrent or subsequent keyboard
//     /// input. This key value is used for the "Windows Logo" key and the Apple `Command` or `⌘` key.
//     ///
//     /// Note: In some contexts (e.g. the Web) this is referred to as the "Meta" key.
//     Super: 'Super',
//     /// The `Enter` or `↵` key. Used to activate current selection or accept current input. This key
//     /// value is also used for the `Return` (Macintosh numpad) key. This key value is also used for
//     /// the Android `KEYCODE_DPAD_CENTER`.
//     Enter: 'Enter',
//     /// The Horizontal Tabulation `Tab` key.
//     Tab: 'Tab',
//     /// Used in text to insert a space between words. Usually located below the character keys.
//     Space: 'Space',

//     /// Navigate or traverse downward. (`KEYCODE_DPAD_DOWN`)
//     ArrowDown: 'ArrowDown',
//     /// Navigate or traverse leftward. (`KEYCODE_DPAD_LEFT`)
//     ArrowLeft: 'ArrowLeft',
//     /// Navigate or traverse rightward. (`KEYCODE_DPAD_RIGHT`)
//     ArrowRight: 'ArrowRight',
//     /// Navigate or traverse upward. (`KEYCODE_DPAD_UP`)
//     ArrowUp: 'ArrowUp',
//     /// The End key, used with keyboard entry to go to the end of content (`KEYCODE_MOVE_END`).
//     End: 'End',
//     /// The Home key, used with keyboard entry, to go to start of content (`KEYCODE_MOVE_HOME`).
//     /// For the mobile phone `Home` key (which goes to the phone’s main screen), use [`GoHome`].
//     ///
//     /// [`GoHome`]: Self::GoHome
//     Home: 'Home',
//     /// Scroll down or display next page of content.
//     PageDown: 'PageDown',
//     /// Scroll up or display previous page of content.
//     PageUp: 'PageUp',

//     /// Used to remove the character to the left of the cursor. This key value is also used for
//     /// the key labeled `Delete` on macOS keyboards.
//     Backspace: 'Backspace',
//     /// Remove the currently selected input.
//     Clear: 'Clear',
//     /// Copy the current selection. (`APPCOMMAND_COPY`)
//     Copy: 'Copy',
//     /// The Cursor Select key.
//     CrSel: 'CrSel',
//     /// Cut the current selection. (`APPCOMMAND_CUT`)
//     Cut: 'Cut',
//     /// Used to delete the character to the right of the cursor. This key value is also used for the
//     /// key labeled `Delete` on macOS keyboards when `Fn` is active.
//     Delete: 'Delete',

//     /// The Erase to End of Field key. This key deletes all characters from the current cursor
//     /// position to the end of the current field.
//     EraseEof: 'EraseEof',
//     /// The Extend Selection (Exsel) key.
//     ExSel: 'ExSel',
//     /// Toggle between text modes for insertion or overtyping.
//     /// (`KEYCODE_INSERT`)
//     Insert: 'Insert',
//     /// The Paste key. (`APPCOMMAND_PASTE`)
//     Paste: 'Paste',
//     /// Redo the last action. (`APPCOMMAND_REDO`)
//     Redo: 'Redo',
//     /// Undo the last action. (`APPCOMMAND_UNDO`)
//     Undo: 'Undo',
//     /// The Accept (Commit, OK) key. Accept current option or input method sequence conversion.
//     Accept: 'Accept',
//     /// Redo or repeat an action.
//     Again: 'Again',
//     /// The Attention (Attn) key.
//     Attn: 'Attn',
//     /// The Cancel key. (on linux and web)
//     Cancel: 'Cancel',
//     /// Show the application’s context menu.
//     /// This key is commonly found between the right `Super` key and the right `Control` key.
//     ContextMenu: 'ContextMenu',
//     /// The `Esc` key. This key was originally used to initiate an escape sequence, but is
//     /// now more generally used to exit or "escape" the current context, such as closing a dialog
//     /// or exiting full screen mode.
//     Escape: 'Escape',
//     /// The Execute key.
//     Execute: 'Execute',
//     /// Open the Find dialog. (`APPCOMMAND_FIND`)
//     Find: 'Find',
//     /// Open a help dialog or toggle display of help information. (`APPCOMMAND_HELP`,
//     /// `KEYCODE_HELP`)
//     Help: 'Help',
//     /// Pause the current state or application (as appropriate).
//     ///
//     /// Note: Do not use this value for the `Pause` button on media controllers. Use `"MediaPause"`
//     /// instead.
//     Pause: 'Pause',
//     Play: 'Play',
//     /// The properties (Props) key.
//     Props: 'Props',
//     /// The Select key.
//     Select: 'Select',
//     /// The ZoomIn key. (`KEYCODE_ZOOM_IN`)
//     ZoomIn: 'ZoomIn',
//     /// The ZoomOut key. (`KEYCODE_ZOOM_OUT`)
//     ZoomOut: 'ZoomOut',
//     /// The Brightness Down key. Typically controls the display brightness.
//     /// (`KEYCODE_BRIGHTNESS_DOWN`)
//     BrightnessDown: 'BrightnessDown',
//     /// The Brightness Up key. Typically controls the display brightness. (`KEYCODE_BRIGHTNESS_UP`)
//     BrightnessUp: 'BrightnessUp',
//     /// Toggle removable media to eject (open) and insert (close) state. (`KEYCODE_MEDIA_EJECT`)
//     Eject: 'Eject',
//     /// LogOff
//     LogOff: 'LogOff',
//     /// Toggle power state. (`KEYCODE_POWER`)
//     /// Note: Some devices might not expose this key to the operating environment.
//     Power: 'Power',
//     /// The `PowerOff` key. Sometime called `PowerDown`.
//     PowerOff: 'PowerOff',
//     /// Initiate print-screen function.
//     PrintScreen: 'PrintScreen',
//     /// The Hibernate key. This key saves the current state of the computer to disk so that it can
//     /// be restored. The computer will then shutdown.
//     Hibernate: 'Hibernate',
//     /// The Standby key. This key turns off the display and places the computer into a low-power
//     /// mode without completely shutting down. It is sometimes labeled `Suspend` or `Sleep` key.
//     /// (`KEYCODE_SLEEP`)
//     Standby: 'Standby',
//     /// The WakeUp key. (`KEYCODE_WAKEUP`)
//     WakeUp: 'WakeUp',
//     /// Initiate the multi-candidate mode.
//     AllCandidates: 'AllCandidates',
//     /// The Alphanumeric key (on linux/web)
//     Alphanumeric: 'Alphanumeric',
//     /// Initiate the Code Input mode to allow characters to be entered by
//     /// their code points.
//     CodeInput: 'CodeInput',
//     /// The Compose key, also known as "Multi_key" on the X Window System. This key acts in a
//     /// manner similar to a dead key, triggering a mode where subsequent key presses are combined to
//     /// produce a different character.
//     Compose: 'Compose',
//     /// Convert the current input method sequence.
//     Convert: 'Convert',
//     /// The Final Mode `Final` key used on some Asian keyboards, to enable the final mode for IMEs.
//     FinalMode: 'FinalMode',
//     /// Switch to the first character group. (ISO/IEC 9995)
//     GroupFirst: 'GroupFirst',
//     /// Switch to the last character group. (ISO/IEC 9995)
//     GroupLast: 'GroupLast',
//     /// Switch to the next character group. (ISO/IEC 9995)
//     GroupNext: 'GroupNext',
//     /// Switch to the previous character group. (ISO/IEC 9995)
//     GroupPrevious: 'GroupPrevious',
//     /// Toggle between or cycle through input modes of IMEs.
//     ModeChange: 'ModeChange',
//     /// NextCandidate, web only.
//     NextCandidate: 'NextCandidate',
//     /// Accept current input method sequence without
//     /// conversion in IMEs.
//     NonConvert: 'NonConvert',
//     /// PreviousCandidate, web only.
//     PreviousCandidate: 'PreviousCandidate',
//     /// IME PROCESS key
//     Process: 'Process',
//     /// SingleCandidate
//     SingleCandidate: 'SingleCandidate',
//     /// Toggle between Hangul and English modes.
//     HangulMode: 'HangulMode',
//     /// HanjaMode
//     HanjaMode: 'HanjaMode',
//     /// JunjaMode
//     JunjaMode: 'JunjaMode',
//     /// The Eisu key. This key may close the IME, but its purpose is defined by the current IME.
//     /// (`KEYCODE_EISU`)
//     Eisu: 'Eisu',
//     /// The (Half-Width) Characters key.
//     Hankaku: 'Hankaku',
//     /// The Hiragana (Japanese Kana characters) key.
//     Hiragana: 'Hiragana',
//     /// The Hiragana/Katakana toggle key. (`KEYCODE_KATAKANA_HIRAGANA`)
//     HiraganaKatakana: 'HiraganaKatakana',
//     /// The Kana Mode (Kana Lock) key. This key is used to enter hiragana mode (typically from
//     /// romaji mode).
//     KanaMode: 'KanaMode',
//     /// The Kanji (Japanese name for ideographic characters of Chinese origin) Mode key. This key is
//     /// typically used to switch to a hiragana keyboard for the purpose of converting input into
//     /// kanji. (`KEYCODE_KANA`)
//     KanjiMode: 'KanjiMode',
//     /// The Katakana (Japanese Kana characters) key.
//     Katakana: 'Katakana',
//     /// The Roman characters function key.
//     Romaji: 'Romaji',
//     /// The Zenkaku (Full-Width) Characters key.
//     Zenkaku: 'Zenkaku',
//     /// The Zenkaku/Hankaku (full-width/half-width) toggle key. (`KEYCODE_ZENKAKU_HANKAKU`)
//     ZenkakuHankaku: 'ZenkakuHankaku',
//     /// General purpose virtual function key, as index 1.
//     Soft1: 'Soft1',
//     /// General purpose virtual function key, as index 2.
//     Soft2: 'Soft2',
//     /// General purpose virtual function key, as index 3.
//     Soft3: 'Soft3',
//     /// General purpose virtual function key, as index 4.
//     Soft4: 'Soft4',
//     /// Select next (numerically or logically) lower channel. (`APPCOMMAND_MEDIA_CHANNEL_DOWN`,
//     /// `KEYCODE_CHANNEL_DOWN`)
//     ChannelDown: 'ChannelDown',
//     /// Select next (numerically or logically) higher channel. (`APPCOMMAND_MEDIA_CHANNEL_UP`,
//     /// `KEYCODE_CHANNEL_UP`)
//     ChannelUp: 'ChannelUp',
//     /// Close the current document or message (Note: This doesn’t close the application).
//     /// (`APPCOMMAND_CLOSE`)
//     Close: 'Close',
//     /// Open an editor to forward the current message. (`APPCOMMAND_FORWARD_MAIL`)
//     MailForward: 'MailForward',
//     /// Open an editor to reply to the current message. (`APPCOMMAND_REPLY_TO_MAIL`)
//     MailReply: 'MailReply',
//     /// Send the current message. (`APPCOMMAND_SEND_MAIL`)
//     MailSend: 'MailSend',
//     /// Close the current media, for example to close a CD or DVD tray. (`KEYCODE_MEDIA_CLOSE`)
//     MediaClose: 'MediaClose',
//     /// Initiate or continue forward playback at faster than normal speed, or increase speed if
//     /// already fast forwarding. (`APPCOMMAND_MEDIA_FAST_FORWARD`, `KEYCODE_MEDIA_FAST_FORWARD`)
//     MediaFastForward: 'MediaFastForward',
//     /// Pause the currently playing media. (`APPCOMMAND_MEDIA_PAUSE`, `KEYCODE_MEDIA_PAUSE`)
//     ///
//     /// Note: Media controller devices should use this value rather than `"Pause"` for their pause
//     /// keys.
//     MediaPause: 'MediaPause',
//     /// Initiate or continue media playback at normal speed, if not currently playing at normal
//     /// speed. (`APPCOMMAND_MEDIA_PLAY`, `KEYCODE_MEDIA_PLAY`)
//     MediaPlay: 'MediaPlay',
//     /// Toggle media between play and pause states. (`APPCOMMAND_MEDIA_PLAY_PAUSE`,
//     /// `KEYCODE_MEDIA_PLAY_PAUSE`)
//     MediaPlayPause: 'MediaPlayPause',
//     /// Initiate or resume recording of currently selected media. (`APPCOMMAND_MEDIA_RECORD`,
//     /// `KEYCODE_MEDIA_RECORD`)
//     MediaRecord: 'MediaRecord',
//     /// Initiate or continue reverse playback at faster than normal speed, or increase speed if
//     /// already rewinding. (`APPCOMMAND_MEDIA_REWIND`, `KEYCODE_MEDIA_REWIND`)
//     MediaRewind: 'MediaRewind',
//     /// Stop media playing, pausing, forwarding, rewinding, or recording, if not already stopped.
//     /// (`APPCOMMAND_MEDIA_STOP`, `KEYCODE_MEDIA_STOP`)
//     MediaStop: 'MediaStop',
//     /// Seek to next media or program track. (`APPCOMMAND_MEDIA_NEXTTRACK`, `KEYCODE_MEDIA_NEXT`)
//     MediaTrackNext: 'MediaTrackNext',
//     /// Seek to previous media or program track. (`APPCOMMAND_MEDIA_PREVIOUSTRACK`,
//     /// `KEYCODE_MEDIA_PREVIOUS`)
//     MediaTrackPrevious: 'MediaTrackPrevious',
//     /// Open a new document or message. (`APPCOMMAND_NEW`)
//     New: 'New',
//     /// Open an existing document or message. (`APPCOMMAND_OPEN`)
//     Open: 'Open',
//     /// Print the current document or message. (`APPCOMMAND_PRINT`)
//     Print: 'Print',
//     /// Save the current document or message. (`APPCOMMAND_SAVE`)
//     Save: 'Save',
//     /// Spellcheck the current document or selection. (`APPCOMMAND_SPELL_CHECK`)
//     SpellCheck: 'SpellCheck',
//     /// The `11` key found on media numpads that
//     /// have buttons from `1` ... `12`.
//     Key11: 'Key11',
//     /// The `12` key found on media numpads that
//     /// have buttons from `1` ... `12`.
//     Key12: 'Key12',
//     /// Adjust audio balance leftward. (`VK_AUDIO_BALANCE_LEFT`)
//     AudioBalanceLeft: 'AudioBalanceLeft',
//     /// Adjust audio balance rightward. (`VK_AUDIO_BALANCE_RIGHT`)
//     AudioBalanceRight: 'AudioBalanceRight',
//     /// Decrease audio bass boost or cycle down through bass boost states. (`APPCOMMAND_BASS_DOWN`,
//     /// `VK_BASS_BOOST_DOWN`)
//     AudioBassBoostDown: 'AudioBassBoostDown',
//     /// Toggle bass boost on/off. (`APPCOMMAND_BASS_BOOST`)
//     AudioBassBoostToggle: 'AudioBassBoostToggle',
//     /// Increase audio bass boost or cycle up through bass boost states. (`APPCOMMAND_BASS_UP`,
//     /// `VK_BASS_BOOST_UP`)
//     AudioBassBoostUp: 'AudioBassBoostUp',
//     /// Adjust audio fader towards front. (`VK_FADER_FRONT`)
//     AudioFaderFront: 'AudioFaderFront',
//     /// Adjust audio fader towards rear. (`VK_FADER_REAR`)
//     AudioFaderRear: 'AudioFaderRear',
//     /// Advance surround audio mode to next available mode. (`VK_SURROUND_MODE_NEXT`)
//     AudioSurroundModeNext: 'AudioSurroundModeNext',
//     /// Decrease treble. (`APPCOMMAND_TREBLE_DOWN`)
//     AudioTrebleDown: 'AudioTrebleDown',
//     /// Increase treble. (`APPCOMMAND_TREBLE_UP`)
//     AudioTrebleUp: 'AudioTrebleUp',
//     /// Decrease audio volume. (`APPCOMMAND_VOLUME_DOWN`, `KEYCODE_VOLUME_DOWN`)
//     AudioVolumeDown: 'AudioVolumeDown',
//     /// Increase audio volume. (`APPCOMMAND_VOLUME_UP`, `KEYCODE_VOLUME_UP`)
//     AudioVolumeUp: 'AudioVolumeUp',
//     /// Toggle between muted state and prior volume level. (`APPCOMMAND_VOLUME_MUTE`,
//     /// `KEYCODE_VOLUME_MUTE`)
//     AudioVolumeMute: 'AudioVolumeMute',
//     /// Toggle the microphone on/off. (`APPCOMMAND_MIC_ON_OFF_TOGGLE`)
//     MicrophoneToggle: 'MicrophoneToggle',
//     /// Decrease microphone volume. (`APPCOMMAND_MICROPHONE_VOLUME_DOWN`)
//     MicrophoneVolumeDown: 'MicrophoneVolumeDown',
//     /// Increase microphone volume. (`APPCOMMAND_MICROPHONE_VOLUME_UP`)
//     MicrophoneVolumeUp: 'MicrophoneVolumeUp',
//     /// Mute the microphone. (`APPCOMMAND_MICROPHONE_VOLUME_MUTE`, `KEYCODE_MUTE`)
//     MicrophoneVolumeMute: 'MicrophoneVolumeMute',
//     /// Show correction list when a word is incorrectly identified. (`APPCOMMAND_CORRECTION_LIST`)
//     SpeechCorrectionList: 'SpeechCorrectionList',
//     /// Toggle between dictation mode and command/control mode.
//     /// (`APPCOMMAND_DICTATE_OR_COMMAND_CONTROL_TOGGLE`)
//     SpeechInputToggle: 'SpeechInputToggle',
//     /// The first generic "LaunchApplication" key. This is commonly associated with launching "My
//     /// Computer", and may have a computer symbol on the key. (`APPCOMMAND_LAUNCH_APP1`)
//     LaunchApplication1: 'LaunchApplication1',
//     /// The second generic "LaunchApplication" key. This is commonly associated with launching
//     /// "Calculator", and may have a calculator symbol on the key. (`APPCOMMAND_LAUNCH_APP2`,
//     /// `KEYCODE_CALCULATOR`)
//     LaunchApplication2: 'LaunchApplication2',
//     /// The "Calendar" key. (`KEYCODE_CALENDAR`)
//     LaunchCalendar: 'LaunchCalendar',
//     /// The "Contacts" key. (`KEYCODE_CONTACTS`)
//     LaunchContacts: 'LaunchContacts',
//     /// The "Mail" key. (`APPCOMMAND_LAUNCH_MAIL`)
//     LaunchMail: 'LaunchMail',
//     /// The "Media Player" key. (`APPCOMMAND_LAUNCH_MEDIA_SELECT`)
//     LaunchMediaPlayer: 'LaunchMediaPlayer',
//     /// LaunchMusicPlayer
//     LaunchMusicPlayer: 'LaunchMusicPlayer',
//     /// LaunchPhone
//     LaunchPhone: 'LaunchPhone',
//     /// LaunchScreenSaver
//     LaunchScreenSaver: 'LaunchScreenSaver',
//     /// LaunchSpreadsheet
//     LaunchSpreadsheet: 'LaunchSpreadsheet',
//     /// LaunchWebBrowser
//     LaunchWebBrowser: 'LaunchWebBrowser',
//     /// LaunchWebCam
//     LaunchWebCam: 'LaunchWebCam',
//     /// LaunchWordProcessor
//     LaunchWordProcessor: 'LaunchWordProcessor',
//     /// Navigate to previous content or page in current history. (`APPCOMMAND_BROWSER_BACKWARD`)
//     BrowserBack: 'BrowserBack',
//     /// Open the list of browser favorites. (`APPCOMMAND_BROWSER_FAVORITES`)
//     BrowserFavorites: 'BrowserFavorites',
//     /// Navigate to next content or page in current history. (`APPCOMMAND_BROWSER_FORWARD`)
//     BrowserForward: 'BrowserForward',
//     /// Go to the user’s preferred home page. (`APPCOMMAND_BROWSER_HOME`)
//     BrowserHome: 'BrowserHome',
//     /// Refresh the current page or content. (`APPCOMMAND_BROWSER_REFRESH`)
//     BrowserRefresh: 'BrowserRefresh',
//     /// Call up the user’s preferred search page. (`APPCOMMAND_BROWSER_SEARCH`)
//     BrowserSearch: 'BrowserSearch',
//     /// Stop loading the current page or content. (`APPCOMMAND_BROWSER_STOP`)
//     BrowserStop: 'BrowserStop',
//     /// The Application switch key, which provides a list of recent apps to switch between.
//     /// (`KEYCODE_APP_SWITCH`)
//     AppSwitch: 'AppSwitch',
//     /// The Call key. (`KEYCODE_CALL`)
//     /// The Call key. (`KEYCODE_CALL`)
//     Call: 'Call',
//     /// The Camera key. (`KEYCODE_CAMERA`)
//     Camera: 'Camera',
//     /// The Camera focus key. (`KEYCODE_FOCUS`)
//     CameraFocus: 'CameraFocus',
//     /// The End Call key. (`KEYCODE_ENDCALL`)
//     EndCall: 'EndCall',
//     /// The Back key. (`KEYCODE_BACK`)
//     GoBack: 'GoBack',
//     /// The Home key, which goes to the phone’s main screen. (`KEYCODE_HOME`)
//     GoHome: 'GoHome',
//     /// The Headset Hook key. (`KEYCODE_HEADSETHOOK`)
//     HeadsetHook: 'HeadsetHook',
//     /// LastNumberRedial
//     LastNumberRedial: 'LastNumberRedial',
//     /// The Notification key. (`KEYCODE_NOTIFICATION`)
//     Notification: 'Notification',
//     /// Toggle between manner mode state: silent, vibrate, ring, ... (`KEYCODE_MANNER_MODE`)
//     MannerMode: 'MannerMode',
//     /// VoiceDial
//     VoiceDial: 'VoiceDial',
//     /// Switch to viewing TV. (`KEYCODE_TV`)
//     TV: 'TV',
//     /// TV 3D Mode. (`KEYCODE_3D_MODE`)
//     TV3DMode: 'TV3DMode',
//     /// Toggle between antenna and cable input. (`KEYCODE_TV_ANTENNA_CABLE`)
//     TVAntennaCable: 'TVAntennaCable',
//     /// Audio description. (`KEYCODE_TV_AUDIO_DESCRIPTION`)
//     TVAudioDescription: 'TVAudioDescription',
//     /// Audio description mixing volume down. (`KEYCODE_TV_AUDIO_DESCRIPTION_MIX_DOWN`)
//     TVAudioDescriptionMixDown: 'TVAudioDescriptionMixDown',
//     /// Audio description mixing volume up. (`KEYCODE_TV_AUDIO_DESCRIPTION_MIX_UP`)
//     TVAudioDescriptionMixUp: 'TVAudioDescriptionMixUp',
//     /// Contents menu. (`KEYCODE_TV_CONTENTS_MENU`)
//     TVContentsMenu: 'TVContentsMenu',
//     /// Contents menu. (`KEYCODE_TV_DATA_SERVICE`)
//     TVDataService: 'TVDataService',
//     /// Switch the input mode on an external TV. (`KEYCODE_TV_INPUT`)
//     TVInput: 'TVInput',
//     /// Switch to component input #1. (`KEYCODE_TV_INPUT_COMPONENT_1`)
//     TVInputComponent1: 'TVInputComponent1',
//     /// Switch to component input #2. (`KEYCODE_TV_INPUT_COMPONENT_2`)
//     TVInputComponent2: 'TVInputComponent2',
//     /// Switch to composite input #1. (`KEYCODE_TV_INPUT_COMPOSITE_1`)
//     TVInputComposite1: 'TVInputComposite1',
//     /// Switch to composite input #2. (`KEYCODE_TV_INPUT_COMPOSITE_2`)
//     TVInputComposite2: 'TVInputComposite2',
//     /// Switch to HDMI input #1. (`KEYCODE_TV_INPUT_HDMI_1`)
//     TVInputHDMI1: 'TVInputHDMI1',
//     /// Switch to HDMI input #2. (`KEYCODE_TV_INPUT_HDMI_2`)
//     TVInputHDMI2: 'TVInputHDMI2',
//     /// Switch to HDMI input #3. (`KEYCODE_TV_INPUT_HDMI_3`)
//     TVInputHDMI3: 'TVInputHDMI3',
//     /// Switch to HDMI input #4. (`KEYCODE_TV_INPUT_HDMI_4`)
//     TVInputHDMI4: 'TVInputHDMI4',
//     /// Switch to VGA input #1. (`KEYCODE_TV_INPUT_VGA_1`)
//     TVInputVGA1: 'TVInputVGA1',
//     /// Media context menu. (`KEYCODE_TV_MEDIA_CONTEXT_MENU`)
//     TVMediaContext: 'TVMediaContext',
//     /// Toggle network. (`KEYCODE_TV_NETWORK`)
//     TVNetwork: 'TVNetwork',
//     /// Number entry. (`KEYCODE_TV_NUMBER_ENTRY`)
//     TVNumberEntry: 'TVNumberEntry',
//     /// Toggle the power on an external TV. (`KEYCODE_TV_POWER`)
//     TVPower: 'TVPower',
//     /// Radio. (`KEYCODE_TV_RADIO_SERVICE`)
//     TVRadioService: 'TVRadioService',
//     /// Satellite. (`KEYCODE_TV_SATELLITE`)
//     TVSatellite: 'TVSatellite',
//     /// Broadcast Satellite. (`KEYCODE_TV_SATELLITE_BS`)
//     TVSatelliteBS: 'TVSatelliteBS',
//     /// Communication Satellite. (`KEYCODE_TV_SATELLITE_CS`)
//     TVSatelliteCS: 'TVSatelliteCS',
//     /// Toggle between available satellites. (`KEYCODE_TV_SATELLITE_SERVICE`)
//     TVSatelliteToggle: 'TVSatelliteToggle',
//     /// Analog Terrestrial. (`KEYCODE_TV_TERRESTRIAL_ANALOG`)
//     TVTerrestrialAnalog: 'TVTerrestrialAnalog',
//     /// Digital Terrestrial. (`KEYCODE_TV_TERRESTRIAL_DIGITAL`)
//     TVTerrestrialDigital: 'TVTerrestrialDigital',
//     /// Timer programming. (`KEYCODE_TV_TIMER_PROGRAMMING`)
//     TVTimer: 'TVTimer',
//     /// Switch the input mode on an external AVR (audio/video receiver). (`KEYCODE_AVR_INPUT`)
//     AVRInput: 'AVRInput',
//     /// Toggle the power on an external AVR (audio/video receiver). (`KEYCODE_AVR_POWER`)
//     AVRPower: 'AVRPower',
//     /// General purpose color-coded media function key, as index 0 (red). (`VK_COLORED_KEY_0`,
//     /// `KEYCODE_PROG_RED`)
//     ColorF0Red: 'ColorF0Red',
//     /// General purpose color-coded media function key, as index 1 (green). (`VK_COLORED_KEY_1`,
//     /// `KEYCODE_PROG_GREEN`)
//     ColorF1Green: 'ColorF1Green',
//     /// General purpose color-coded media function key, as index 2 (yellow). (`VK_COLORED_KEY_2`,
//     /// `KEYCODE_PROG_YELLOW`)
//     ColorF2Yellow: 'ColorF2Yellow',
//     /// General purpose color-coded media function key, as index 3 (blue). (`VK_COLORED_KEY_3`,
//     /// `KEYCODE_PROG_BLUE`)
//     ColorF3Blue: 'ColorF3Blue',
//     /// General purpose color-coded media function key, as index 4 (grey). (`VK_COLORED_KEY_4`)
//     ColorF4Grey: 'ColorF4Grey',
//     /// General purpose color-coded media function key, as index 5 (brown). (`VK_COLORED_KEY_5`)
//     ColorF5Brown: 'ColorF5Brown',
//     /// Toggle the display of Closed Captions. (`VK_CC`, `KEYCODE_CAPTIONS`)
//     ClosedCaptionToggle: 'ClosedCaptionToggle',
//     /// Adjust brightness of device, by toggling between or cycling through states. (`VK_DIMMER`)
//     Dimmer: 'Dimmer',
//     /// Swap video sources. (`VK_DISPLAY_SWAP`)
//     DisplaySwap: 'DisplaySwap',
//     /// Select Digital Video Recorder. (`KEYCODE_DVR`)
//     DVR: 'DVR',
//     /// Exit the current application. (`VK_EXIT`)
//     Exit: 'Exit',
//     /// Clear program or content stored as favorite 0. (`VK_CLEAR_FAVORITE_0`)
//     FavoriteClear0: 'FavoriteClear0',
//     /// Clear program or content stored as favorite 1. (`VK_CLEAR_FAVORITE_1`)
//     FavoriteClear1: 'FavoriteClear1',
//     /// Clear program or content stored as favorite 2. (`VK_CLEAR_FAVORITE_2`)
//     FavoriteClear2: 'FavoriteClear2',
//     /// Clear program or content stored as favorite 3. (`VK_CLEAR_FAVORITE_3`)
//     FavoriteClear3: 'FavoriteClear3',
//     /// Select (recall) program or content stored as favorite 0. (`VK_RECALL_FAVORITE_0`)
//     FavoriteRecall0: 'FavoriteRecall0',
//     /// Select (recall) program or content stored as favorite 1. (`VK_RECALL_FAVORITE_1`)
//     FavoriteRecall1: 'FavoriteRecall1',
//     /// Select (recall) program or content stored as favorite 2. (`VK_RECALL_FAVORITE_2`)
//     FavoriteRecall2: 'FavoriteRecall2',
//     /// Select (recall) program or content stored as favorite 3. (`VK_RECALL_FAVORITE_3`)
//     FavoriteRecall3: 'FavoriteRecall3',
//     /// Store current program or content as favorite 0. (`VK_STORE_FAVORITE_0`)
//     FavoriteStore0: 'FavoriteStore0',
//     /// Store current program or content as favorite 1. (`VK_STORE_FAVORITE_1`)
//     FavoriteStore1: 'FavoriteStore1',
//     /// Store current program or content as favorite 2. (`VK_STORE_FAVORITE_2`)
//     FavoriteStore2: 'FavoriteStore2',
//     /// Store current program or content as favorite 3. (`VK_STORE_FAVORITE_3`)
//     FavoriteStore3: 'FavoriteStore3',
//     /// Toggle display of program or content guide. (`VK_GUIDE`, `KEYCODE_GUIDE`)
//     Guide: 'Guide',
//     /// If guide is active and displayed, then display next day’s content. (`VK_NEXT_DAY`)
//     GuideNextDay: 'GuideNextDay',
//     /// If guide is active and displayed, then display previous day’s content. (`VK_PREV_DAY`)
//     GuidePreviousDay: 'GuidePreviousDay',
//     /// Toggle display of information about currently selected context or media. (`VK_INFO`,
//     /// `KEYCODE_INFO`)
//     Info: 'Info',
//     /// Toggle instant replay. (`VK_INSTANT_REPLAY`)
//     InstantReplay: 'InstantReplay',
//     /// Launch linked content, if available and appropriate. (`VK_LINK`)
//     Link: 'Link',
//     /// List the current program. (`VK_LIST`)
//     ListProgram: 'ListProgram',
//     /// Toggle display listing of currently available live content or programs. (`VK_LIVE`)
//     LiveContent: 'LiveContent',
//     /// Lock or unlock current content or program. (`VK_LOCK`)
//     Lock: 'Lock',
//     /// Show a list of media applications: audio/video players and image viewers. (`VK_APPS`)
//     ///
//     /// Note: Do not confuse this key value with the Windows' `VK_APPS` / `VK_CONTEXT_MENU` key,
//     /// which is encoded as `"ContextMenu"`.
//     MediaApps: 'MediaApps',
//     /// Audio track key. (`KEYCODE_MEDIA_AUDIO_TRACK`)
//     MediaAudioTrack: 'MediaAudioTrack',
//     /// Select previously selected channel or media. (`VK_LAST`, `KEYCODE_LAST_CHANNEL`)
//     MediaLast: 'MediaLast',
//     /// Skip backward to next content or program. (`KEYCODE_MEDIA_SKIP_BACKWARD`)
//     MediaSkipBackward: 'MediaSkipBackward',
//     /// Skip forward to next content or program. (`VK_SKIP`, `KEYCODE_MEDIA_SKIP_FORWARD`)
//     MediaSkipForward: 'MediaSkipForward',
//     /// Step backward to next content or program. (`KEYCODE_MEDIA_STEP_BACKWARD`)
//     MediaStepBackward: 'MediaStepBackward',
//     /// Step forward to next content or program. (`KEYCODE_MEDIA_STEP_FORWARD`)
//     MediaStepForward: 'MediaStepForward',
//     /// Media top menu. (`KEYCODE_MEDIA_TOP_MENU`)
//     MediaTopMenu: 'MediaTopMenu',
//     /// Navigate in. (`KEYCODE_NAVIGATE_IN`)
//     NavigateIn: 'NavigateIn',
//     /// Navigate to next key. (`KEYCODE_NAVIGATE_NEXT`)
//     NavigateNext: 'NavigateNext',
//     /// Navigate out. (`KEYCODE_NAVIGATE_OUT`)
//     NavigateOut: 'NavigateOut',
//     /// Navigate to previous key. (`KEYCODE_NAVIGATE_PREVIOUS`)
//     NavigatePrevious: 'NavigatePrevious',
//     /// Cycle to next favorite channel (in favorites list). (`VK_NEXT_FAVORITE_CHANNEL`)
//     NextFavoriteChannel: 'NextFavoriteChannel',
//     /// Cycle to next user profile (if there are multiple user profiles). (`VK_USER`)
//     NextUserProfile: 'NextUserProfile',
//     /// Access on-demand content or programs. (`VK_ON_DEMAND`)
//     OnDemand: 'OnDemand',
//     /// Pairing key to pair devices. (`KEYCODE_PAIRING`)
//     Pairing: 'Pairing',
//     /// Move picture-in-picture window down. (`VK_PINP_DOWN`)
//     PinPDown: 'PinPDown',
//     /// Move picture-in-picture window. (`VK_PINP_MOVE`)
//     PinPMove: 'PinPMove',
//     /// Toggle display of picture-in-picture window. (`VK_PINP_TOGGLE`)
//     PinPToggle: 'PinPToggle',
//     /// Move picture-in-picture window up. (`VK_PINP_UP`)
//     PinPUp: 'PinPUp',
//     /// Decrease media playback speed. (`VK_PLAY_SPEED_DOWN`)
//     PlaySpeedDown: 'PlaySpeedDown',
//     /// Reset playback to normal speed. (`VK_PLAY_SPEED_RESET`)
//     PlaySpeedReset: 'PlaySpeedReset',
//     /// Increase media playback speed. (`VK_PLAY_SPEED_UP`)
//     PlaySpeedUp: 'PlaySpeedUp',
//     /// Toggle random media or content shuffle mode. (`VK_RANDOM_TOGGLE`)
//     RandomToggle: 'RandomToggle',
//     /// Not a physical key, but this key code is sent when the remote control battery is low.
//     /// (`VK_RC_LOW_BATTERY`)
//     RcLowBattery: 'RcLowBattery',
//     /// Toggle or cycle between media recording speeds. (`VK_RECORD_SPEED_NEXT`)
//     RecordSpeedNext: 'RecordSpeedNext',
//     /// Toggle RF (radio frequency) input bypass mode (pass RF input directly to the RF output).
//     /// (`VK_RF_BYPASS`)
//     RfBypass: 'RfBypass',
//     /// Toggle scan channels mode. (`VK_SCAN_CHANNELS_TOGGLE`)
//     ScanChannelsToggle: 'ScanChannelsToggle',
//     /// Advance display screen mode to next available mode. (`VK_SCREEN_MODE_NEXT`)
//     ScreenModeNext: 'ScreenModeNext',
//     /// Toggle display of device settings screen. (`VK_SETTINGS`, `KEYCODE_SETTINGS`)
//     Settings: 'Settings',
//     /// Toggle split screen mode. (`VK_SPLIT_SCREEN_TOGGLE`)
//     SplitScreenToggle: 'SplitScreenToggle',
//     /// Switch the input mode on an external STB (set top box). (`KEYCODE_STB_INPUT`)
//     STBInput: 'STBInput',
//     /// Toggle the power on an external STB (set top box). (`KEYCODE_STB_POWER`)
//     STBPower: 'STBPower',
//     /// Toggle display of subtitles, if available. (`VK_SUBTITLE`)
//     Subtitle: 'Subtitle',
//     /// Toggle display of teletext, if available (`VK_TELETEXT`, `KEYCODE_TV_TELETEXT`).
//     Teletext: 'Teletext',
//     /// Advance video mode to next available mode. (`VK_VIDEO_MODE_NEXT`)
//     VideoModeNext: 'VideoModeNext',
//     /// Cause device to identify itself in some manner, e.g., audibly or visibly. (`VK_WINK`)
//     Wink: 'Wink',
//     /// Toggle between full-screen and scaled content, or alter magnification level. (`VK_ZOOM`,
//     /// `KEYCODE_TV_ZOOM_MODE`)
//     ZoomToggle: 'ZoomToggle',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F1: 'F1',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F2: 'F2',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F3: 'F3',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F4: 'F4',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F5: 'F5',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F6: 'F6',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F7: 'F7',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F8: 'F8',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F9: 'F9',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F10: 'F10',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F11: 'F11',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F12: 'F12',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F13: 'F13',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F14: 'F14',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F15: 'F15',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F16: 'F16',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F17: 'F17',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F18: 'F18',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F19: 'F19',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F20: 'F20',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F21: 'F21',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F22: 'F22',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F23: 'F23',
//     /// General-purpose function key.
//     /// Usually found at the top of the keyboard.
//     F24: 'F24',
//     /// General-purpose function key.
//     F25: 'F25',
//     /// General-purpose function key.
//     F26: 'F26',
//     /// General-purpose function key.
//     F27: 'F27',
//     /// General-purpose function key.
//     F28: 'F28',
//     /// General-purpose function key.
//     F29: 'F29',
//     /// General-purpose function key.
//     F30: 'F30',
//     /// General-purpose function key.
//     F31: 'F31',
//     /// General-purpose function key.
//     F32: 'F32',
//     /// General-purpose function key.
//     F33: 'F33',
//     /// General-purpose function key.
//     F34: 'F34',
//     /// General-purpose function key.
//     F35: 'F35',
// } as const

type KeyboardInput = KeyboardEvent & {
    key: Key;
    state: ButtonState;
};

type KeyboardFocusLost = any;

export function keyboard_input_system(
    key_input: ResMut<ButtonInput<Key>>,
    keyboard_input_events: EventReader<KeyboardInput>,
    focus_events: EventReader<KeyboardFocusLost>
) {

    key_input.bypass_change_detection().clear();

    const key_input_ = key_input.deref_mut();
    keyboard_input_events.read().for_each(event => {
        const { key, state } = event
        if (ButtonState.Pressed === state) {
            key_input_.press(key);
        } else if (ButtonState.Released === state) {
            key_input_.release(key);
        }
    })
    // Release all cached input to avoid having stuck input when switching between windows in os
    if (!focus_events.is_empty()) {
        key_input_.release_all();
        focus_events.clear();
    }
}