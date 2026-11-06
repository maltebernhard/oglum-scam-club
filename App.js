import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	Animated,
	BackHandler,
	Easing,
	Image,
	Keyboard,
	Modal,
	PixelRatio,
	Platform,
	Pressable,
	SafeAreaView,
	ScrollView,
	StatusBar as RNStatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
	useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useVideoPlayer, VideoView } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

const STORAGE_KEYS = {
	profile: "usc.profile.v1",
	templatesUSC: "usc.templates.v1",
	templatesWellPass: "usc.templates.wellpass.v1",
	mode: "usc.mode.v1",
};

const MODES = { USC: "USC", WELLPASS: "WellPass" };

const DEFAULT_NAME = "Oğlum McDoglum";
const DEFAULT_FORM = {
	location: "Holmes Place Potsdamer Platz",
	activity: "Fitness",
	category: "Fitness",
};

const VIDEO_BASE = { width: 1080, height: 2424 };
const VIDEO_SOURCE = require("./assets/oscv2.mp4");
const WELLPASS_IMAGE_BASE = { width: 2160, height: 3840 };
const WELLPASS_IMAGE_SOURCE = require("./assets/Wellpass_FINAL.png");
const USC_ID = "691312420";

// Base positions are in the source video coordinate system and get scaled to device width.
// TODO: auf source handy von Lat anpassen, dann scaling faktor für font festlegen, damit es auf verschiedenen Bildschirmgrößen gut aussieht. Aktuell ist es auf Pixel 7a optimiert.
const BASE_OVERLAY = {
	avatar: { y: 353, size: 335 },
	nameLine: { y: 775, fontSize: 58, fontScalingFactor: 1.0 },
	checkInLabel: { y: 870, fontSize: 46, fontScalingFactor: 1.0 },
	locationLabel: { y: 1015, fontSize: 42, fontScalingFactor: 1.0, leftPadding: 300, rightPadding: 43 },
	activityLabel: { y: 1165, fontSize: 42, fontScalingFactor: 1.0, leftPadding: 300, rightPadding: 43 },
	categoryLabel: { y: 1315, fontSize: 42, fontScalingFactor: 1.0, leftPadding: 320, rightPadding: 43 },
};

// Placeholder positions for the WellPass overlay, authored as fractions of the background
// image's own height (Wellpass_FINAL.png, which is always stretched to match the screen's
// rendered height) so they stay correct regardless of the image's pixel resolution.
// Avatar center sits ~40% from the top (slightly above center); name/location/activity/date-time
// stack below it, name at ~60% from the top (40% from the bottom). Will be refined after testing.
const WELLPASS_IMAGE_HEIGHT = WELLPASS_IMAGE_BASE.height;
const WELLPASS_OVERLAY = {
	avatar: { y: 0.3294 * WELLPASS_IMAGE_HEIGHT, size: 0.2305 * WELLPASS_IMAGE_HEIGHT },
	nameLine: { y: 0.58 * WELLPASS_IMAGE_HEIGHT, fontSize: 0.032 * WELLPASS_IMAGE_HEIGHT, fontScalingFactor: 1.0 },
	locationLabel: { y: 0.635 * WELLPASS_IMAGE_HEIGHT, fontSize: 0.018 * WELLPASS_IMAGE_HEIGHT, fontScalingFactor: 1.0 },
	activityLabel: { y: 0.67 * WELLPASS_IMAGE_HEIGHT, fontSize: 0.018 * WELLPASS_IMAGE_HEIGHT, fontScalingFactor: 1.0 },
	checkInLabel: { y: 0.705 * WELLPASS_IMAGE_HEIGHT, fontSize: 0.018 * WELLPASS_IMAGE_HEIGHT, fontScalingFactor: 1.0 },
};

// Pulsing check-in circle animation (WellPass mode): expand+fade, expand+fade, then a pause,
// looping for as long as the check-in screen stays open.
const PULSE_EXPAND_MS = 400;
const PULSE_PAUSE_MS = 800;
const PULSE_CYCLE_MS = PULSE_EXPAND_MS * 2 + PULSE_PAUSE_MS;
const PULSE_EXPAND_WIDTH_FRACTION = 0.1;
const PULSE_COLOR = "#20755e";

const INSTRUCTIONS_TEXT = `1. Mach oder wähle ein cutes Selfie.
2. Wähle den Namen deiner Träume.
3. Gib Text für Standort, Aktivität und Kategorie ein. Beispiel für HP:
		- Location: Holmes Place Potsdamer Platz
		- Aktivität: Fitness
		- Kategorie: Fitness
4. Tu so, als scannst du den QR Code von USC.
5. Drücke auf "check-in".
6. Zeig selbstbewusst Screen und geh rein.
7. Gain.
Snitches get Stitches. Falls ihr erwischt werdet, rennt...`;

const emptyTemplates = () => ({ headId: null, byId: {} });

const locationKey = (value) => value.trim().toLowerCase();

const listTemplates = (store) => {
	const result = [];
	let currentId = store.headId;
	const guard = new Set();
	while (currentId && store.byId[currentId] && !guard.has(currentId)) {
		guard.add(currentId);
		const node = store.byId[currentId];
		result.push(node);
		currentId = node.nextId;
	}
	return result;
};

const moveToHead = (store, id) => {
	if (!store.byId[id] || store.headId === id) {
		return store;
	}

	const byId = { ...store.byId };
	let prevId = null;
	let currentId = store.headId;
	while (currentId && currentId !== id) {
		prevId = currentId;
		currentId = byId[currentId]?.nextId ?? null;
	}

	if (!currentId) {
		return store;
	}

	byId[prevId] = { ...byId[prevId], nextId: byId[id].nextId };
	byId[id] = { ...byId[id], nextId: store.headId };
	return { headId: id, byId };
};

const upsertTemplate = (store, form) => {
	const id = locationKey(form.location);
	if (!id) {
		return store;
	}

	const base = {
		id,
		location: form.location.trim(),
		activity: form.activity.trim(),
		category: form.category.trim(),
		nextId: null,
	};

	const byId = { ...store.byId };
	if (!byId[id]) {
		byId[id] = { ...base, nextId: store.headId };
		return { headId: id, byId };
	}

	byId[id] = { ...byId[id], ...base, nextId: byId[id].nextId };
	return moveToHead({ headId: store.headId, byId }, id);
};

const deleteTemplate = (store, id) => {
	if (!store.byId[id]) {
		return store;
	}

	const byId = { ...store.byId };
	const isHead = store.headId === id;
	let nextHead = store.headId;

	if (isHead) {
		nextHead = byId[id].nextId || null;
		delete byId[id];
		return { headId: nextHead, byId };
	}

	let currentId = store.headId;
	while (currentId && byId[currentId]?.nextId !== id) {
		currentId = byId[currentId]?.nextId ?? null;
	}

	if (!currentId) {
		return store;
	}

	byId[currentId] = { ...byId[currentId], nextId: byId[id].nextId || null };
	delete byId[id];
	return { headId: nextHead, byId };
};

const formatClock = (seconds) => {
	const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
	const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
	const s = String(seconds % 60).padStart(2, "0");
	return `${h}:${m}:${s}`;
};

const formatCheckInDate = (date) => {
	const value = date || new Date();
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(value);
};

const formatCheckInTime = (date) => {
	const value = date || new Date();
	return new Intl.DateTimeFormat("de-DE", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(value);
};

const formatWellPassDateTime = (date) => {
	const value = date || new Date();
	return new Intl.DateTimeFormat("en-US", {
		month: "2-digit",
		day: "2-digit",
		year: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	}).format(value);
};

export default function App() {
	const videoPlayer = useVideoPlayer(VIDEO_SOURCE, (player) => {
		player.loop = true;
		player.muted = true;
	});

	const [ready, setReady] = useState(false);
	const [displayName, setDisplayName] = useState(DEFAULT_NAME);
	const [profileUri, setProfileUri] = useState(null);

	const [mode, setMode] = useState(MODES.USC);

	const [location, setLocation] = useState(DEFAULT_FORM.location);
	const [activity, setActivity] = useState(DEFAULT_FORM.activity);
	const [category, setCategory] = useState(DEFAULT_FORM.category);

	const [templatesUSC, setTemplatesUSC] = useState(emptyTemplates());
	const [templatesWellPass, setTemplatesWellPass] = useState(emptyTemplates());
	const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);

	const [isCheckInOpen, setCheckInOpen] = useState(false);
	const [checkInStartedAt, setCheckInStartedAt] = useState(null);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	const locationRef = useRef(null);
	const activityRef = useRef(null);
	const categoryRef = useRef(null);
	// Remembers each mode's in-progress (possibly unsaved) form fields so switching
	// back restores exactly what was there before, not the last saved template.
	const modeFormSnapshots = useRef({});
	const pulseAnim = useRef(new Animated.Value(0)).current;

	const isWellPass = mode === MODES.WELLPASS;
	const currentTemplates = isWellPass ? templatesWellPass : templatesUSC;
	const setCurrentTemplates = isWellPass ? setTemplatesWellPass : setTemplatesUSC;
	const activeOverlay = isWellPass ? WELLPASS_OVERLAY : BASE_OVERLAY;

	const { width: screenWidth, height: screenHeight } = useWindowDimensions();
	// Measured from the actual rendered container instead of trusted purely from
	// useWindowDimensions, which can disagree with real available pixels on some
	// older/OEM Android devices (status/nav bar insets, edge-to-edge quirks).
	const [frameWidth, setFrameWidth] = useState(screenWidth);
	const [frameHeight, setFrameHeight] = useState(screenHeight);
	const onFrameLayout = (event) => {
		const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
		if (measuredWidth && Math.round(measuredWidth) !== Math.round(frameWidth)) {
			setFrameWidth(measuredWidth);
		}
		if (measuredHeight && Math.round(measuredHeight) !== Math.round(frameHeight)) {
			setFrameHeight(measuredHeight);
		}
	};
	// USC's overlay is scaled against the video's rendered width; WellPass's background image is
	// stretched to the screen's height instead (width can over/underlap), so its overlay scales
	// against height to stay pixel-aligned with the image.
	const videoScale = frameWidth / VIDEO_BASE.width;
	const wellPassScale = frameHeight / WELLPASS_IMAGE_BASE.height;
	const activeScale = isWellPass ? wellPassScale : videoScale;
	const wellPassImageWidth = frameHeight * (WELLPASS_IMAGE_BASE.width / WELLPASS_IMAGE_BASE.height);
	const wellPassImageLeft = (frameWidth - wellPassImageWidth) / 2;
	const shouldDisableNativeCrop = Platform.OS === "android" && screenHeight < 760;

	useEffect(() => {
		const loadInitialData = async () => {
			try {
				const [rawProfile, rawTemplatesUSC, rawTemplatesWellPass, rawMode] = await Promise.all([
					AsyncStorage.getItem(STORAGE_KEYS.profile),
					AsyncStorage.getItem(STORAGE_KEYS.templatesUSC),
					AsyncStorage.getItem(STORAGE_KEYS.templatesWellPass),
					AsyncStorage.getItem(STORAGE_KEYS.mode),
				]);

				if (rawProfile) {
					const parsed = JSON.parse(rawProfile);
					setDisplayName(parsed.name?.trim() || DEFAULT_NAME);
					setProfileUri(parsed.imageUri || null);
				} else {
					setDisplayName(DEFAULT_NAME);
				}

				const nextMode = rawMode === MODES.WELLPASS ? MODES.WELLPASS : MODES.USC;
				setMode(nextMode);

				const parseStore = (raw) => {
					if (!raw) {
						return emptyTemplates();
					}
					const parsed = JSON.parse(raw);
					return { headId: parsed?.headId || null, byId: parsed?.byId || {} };
				};

				const nextTemplatesUSC = parseStore(rawTemplatesUSC);
				const nextTemplatesWellPass = parseStore(rawTemplatesWellPass);
				setTemplatesUSC(nextTemplatesUSC);
				setTemplatesWellPass(nextTemplatesWellPass);

				const activeStore = nextMode === MODES.WELLPASS ? nextTemplatesWellPass : nextTemplatesUSC;
				const first = listTemplates(activeStore)[0];
				setLocation(first?.location || DEFAULT_FORM.location);
				setActivity(first?.activity || DEFAULT_FORM.activity);
				setCategory(nextMode === MODES.WELLPASS ? "" : first?.category || DEFAULT_FORM.category);
			} catch {
				setTemplatesUSC(emptyTemplates());
				setTemplatesWellPass(emptyTemplates());
			} finally {
				setReady(true);
			}
		};

		loadInitialData();
	}, []);

	useEffect(() => {
		if (!ready) {
			return;
		}
		AsyncStorage.setItem(
			STORAGE_KEYS.profile,
			JSON.stringify({ name: displayName || DEFAULT_NAME, imageUri: profileUri || null })
		);
	}, [displayName, profileUri, ready]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		AsyncStorage.setItem(STORAGE_KEYS.templatesUSC, JSON.stringify(templatesUSC));
	}, [templatesUSC, ready]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		AsyncStorage.setItem(STORAGE_KEYS.templatesWellPass, JSON.stringify(templatesWellPass));
	}, [templatesWellPass, ready]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		AsyncStorage.setItem(STORAGE_KEYS.mode, mode);
	}, [mode, ready]);

	useEffect(() => {
		let cancelled = false;

		if (isCheckInOpen && !isWellPass) {
			const startPlayback = async () => {
				try {
					await videoPlayer.replaceAsync(VIDEO_SOURCE);
				} catch {
					videoPlayer.replace(VIDEO_SOURCE);
				}

				if (cancelled) {
					return;
				}

				videoPlayer.currentTime = 0;
				videoPlayer.play();
			};

			startPlayback();
			return () => {
				cancelled = true;
			};
		}

		videoPlayer.pause();
		videoPlayer.currentTime = 0;
	}, [isCheckInOpen, isWellPass, videoPlayer]);

	useEffect(() => {
		if (!isCheckInOpen || !isWellPass) {
			pulseAnim.stopAnimation();
			pulseAnim.setValue(0);
			return;
		}

		pulseAnim.setValue(0);
		const loopAnimation = Animated.loop(
			Animated.timing(pulseAnim, {
				toValue: 1,
				duration: PULSE_CYCLE_MS,
				easing: Easing.linear,
				useNativeDriver: true,
			})
		);
		loopAnimation.start();

		return () => {
			loopAnimation.stop();
		};
	}, [isCheckInOpen, isWellPass, pulseAnim]);

	useEffect(() => {
		if (!isCheckInOpen) {
			return;
		}

		const onBack = () => {
			setCheckInOpen(false);
			return true;
		};

		const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
		return () => sub.remove();
	}, [isCheckInOpen]);

	useEffect(() => {
		if (!isCheckInOpen || !checkInStartedAt || isWellPass) {
			return;
		}

		const id = setInterval(() => {
			const delta = Math.floor((Date.now() - checkInStartedAt.getTime()) / 1000);
			setElapsedSeconds(Math.max(0, delta));
		}, 1000);

		return () => clearInterval(id);
	}, [isCheckInOpen, checkInStartedAt, isWellPass]);

	const orderedTemplates = useMemo(() => listTemplates(currentTemplates), [currentTemplates]);
	// Whether the currently typed Location already matches a saved entry in the active mode's
	// list. Only the Location name is used for this check; Activity/Category are ignored.
	const isLocationSaved = Boolean(currentTemplates.byId[locationKey(location)]);

	const closeKeyboard = () => {
		locationRef.current?.blur();
		activityRef.current?.blur();
		categoryRef.current?.blur();
		Keyboard.dismiss();
	};

	const selectMode = (nextMode) => {
		if (nextMode === mode) {
			return;
		}

		closeKeyboard();
		// Remember the mode we're leaving so switching back restores its exact fields.
		modeFormSnapshots.current[mode] = { location, activity, category };
		setMode(nextMode);

		const snapshot = modeFormSnapshots.current[nextMode];
		if (snapshot) {
			setLocation(snapshot.location);
			setActivity(snapshot.activity);
			setCategory(nextMode === MODES.WELLPASS ? "" : snapshot.category);
			return;
		}

		const store = nextMode === MODES.WELLPASS ? templatesWellPass : templatesUSC;
		const first = listTemplates(store)[0];
		setLocation(first?.location || DEFAULT_FORM.location);
		setActivity(first?.activity || DEFAULT_FORM.activity);
		setCategory(nextMode === MODES.WELLPASS ? "" : first?.category || DEFAULT_FORM.category);
	};

	const openCheckIn = () => {
		closeKeyboard();
		setElapsedSeconds(0);
		setCheckInStartedAt(new Date());
		setCheckInOpen(true);
	};

	const pickProfileImage = async () => {
		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Zugriff fehlt", "Bitte erlaube den Zugriff auf deine Galerie.");
			return;
		}

		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			// Some older low-resolution Android devices render native crop action buttons off-screen.
			allowsEditing: !shouldDisableNativeCrop,
			quality: 1,
			aspect: [1, 1],
		});

		if (result.canceled || !result.assets?.length) {
			return;
		}

		const asset = result.assets[0];
		// Show picked image immediately; then persist a copied app-local file path.
		setProfileUri(asset.uri);

		try {
			const cleanedUri = asset.uri.split("?")[0];
			const ext = cleanedUri.split(".").pop() || "jpg";
			const target = `${FileSystem.documentDirectory}profile-${Date.now()}.${ext}`;
			await FileSystem.copyAsync({ from: asset.uri, to: target });
			setProfileUri(target);
		} catch {
			// Keep temporary URI fallback when local copy fails.
		}
	};

	const saveTemplate = () => {
		const candidate = {
			location: location.trim(),
			activity: activity.trim(),
			category: isWellPass ? "" : category.trim(),
		};

		if (!candidate.location) {
			Alert.alert("Fehlt", "Bitte zuerst einen Standort eintragen.");
			return;
		}

		if (isLocationSaved) {
			return;
		}

		setCurrentTemplates((prev) => upsertTemplate(prev, candidate));
	};

	const loadTemplate = (item) => {
		setLocation(item.location || "");
		setActivity(item.activity || "");
		setCategory(isWellPass ? "" : item.category || "");
		setCurrentTemplates((prev) => moveToHead(prev, item.id));
		setTemplateModalOpen(false);
	};

	const removeTemplate = (id) => {
		setCurrentTemplates((prev) => deleteTemplate(prev, id));
	};

	const px = (value) => PixelRatio.roundToNearestPixel(value);
	const overlayXY = (x, y) => ({ left: px(x * activeScale), top: px(y * activeScale) });
	const overlayCentered = (y, width) => ({ left: px((frameWidth - width) / 2), top: px(y * activeScale), width: px(width) });
	const overlayRight = (y, rightPadding = 0) => ({ top: px(y * activeScale), right: px(rightPadding * activeScale) });
	const scaledFont = (baseSize, factor = 1) => px(baseSize * (1 + (activeScale - 1) * factor));
	const overlayRightBox = (y, leftPadding = 0, rightPadding = 0) => ({
		top: px(y * activeScale),
		left: px(leftPadding * activeScale),
		right: px(rightPadding * activeScale),
	});

	if (!ready) {
		return <SafeAreaView style={styles.root} />;
	}

	if (isCheckInOpen) {
		const checkInDate = formatCheckInDate(checkInStartedAt || new Date());
		const checkInTime = formatCheckInTime(checkInStartedAt || new Date());
		const timerText = formatClock(elapsedSeconds);
		const avatarSize = activeOverlay.avatar.size * activeScale;
		const checkInLine = isWellPass
			? formatWellPassDateTime(checkInStartedAt || new Date())
			: `Check-in: ${checkInDate}, ${checkInTime}`;

		// Pulsing green check-in circle (WellPass only): expands by a fixed fraction of the
		// screen width, fading out, in a two-pass loop with a pause in between (see PULSE_* consts).
		const pulseExpandPx = PULSE_EXPAND_WIDTH_FRACTION * frameWidth;
		const pulseExpandFactor = avatarSize > 0 ? (avatarSize + pulseExpandPx) / avatarSize : 1;
		const pulseBreakpoints = [
			0,
			PULSE_EXPAND_MS / PULSE_CYCLE_MS,
			PULSE_EXPAND_MS / PULSE_CYCLE_MS,
			(PULSE_EXPAND_MS * 2) / PULSE_CYCLE_MS,
			(PULSE_EXPAND_MS * 2) / PULSE_CYCLE_MS,
			1,
		];
		const pulseScale = pulseAnim.interpolate({
			inputRange: pulseBreakpoints,
			outputRange: [1, pulseExpandFactor, 1, pulseExpandFactor, 1, 1],
		});
		const pulseOpacity = pulseAnim.interpolate({
			inputRange: pulseBreakpoints,
			outputRange: [0.5, 0, 1, 0, 0.5, 0.5],
		});

		const locationPositionStyle = isWellPass
			? overlayCentered(activeOverlay.locationLabel.y, frameWidth)
			: [
					styles.overlayMetaRight,
					overlayRightBox(
						activeOverlay.locationLabel.y,
						activeOverlay.locationLabel.leftPadding,
						activeOverlay.locationLabel.rightPadding
					),
			  ];

		const activityPositionStyle = isWellPass
			? overlayCentered(activeOverlay.activityLabel.y, frameWidth)
			: [
					styles.overlayMetaRight,
					overlayRightBox(
						activeOverlay.activityLabel.y,
						activeOverlay.activityLabel.leftPadding,
						activeOverlay.activityLabel.rightPadding
					),
			  ];

		return (
			<View style={styles.checkInRoot} onLayout={onFrameLayout}>
				<ExpoStatusBar hidden translucent />
				<View
					style={[
						styles.videoFrame,
						isWellPass
							? { width: frameWidth, height: frameHeight }
							: { width: frameWidth, aspectRatio: VIDEO_BASE.width / VIDEO_BASE.height },
					]}
				>
					{isWellPass ? (
						<Image
							source={WELLPASS_IMAGE_SOURCE}
							resizeMode="stretch"
							style={{
								position: "absolute",
								top: 0,
								left: wellPassImageLeft,
								width: wellPassImageWidth,
								height: frameHeight,
							}}
						/>
					) : (
						<VideoView
							player={videoPlayer}
							style={{ width: "100%", height: "100%" }}
							contentFit="cover"
							nativeControls={false}
						/>
					)}

					<View style={styles.overlayLayer}>
						{isWellPass && (
							<Animated.View
								pointerEvents="none"
								style={[
									styles.pulseCircle,
									overlayCentered(activeOverlay.avatar.y, avatarSize),
									{
										height: avatarSize,
										borderRadius: avatarSize / 2,
										opacity: pulseOpacity,
										transform: [{ scale: pulseScale }],
									},
								]}
							/>
						)}

						<View
							style={[
								styles.avatarWrap,
								overlayCentered(activeOverlay.avatar.y, avatarSize),
								{
									height: avatarSize,
									borderRadius: avatarSize / 2,
								},
							]}
						>
							{profileUri ? (
								<Image source={{ uri: profileUri }} style={styles.avatarImg} />
							) : (
								<Text
									allowFontScaling={false}
									maxFontSizeMultiplier={1}
									style={[styles.avatarFallback, { fontSize: px(42 * activeScale) }]}
								>
									:)
								</Text>
							)}
						</View>

						<Text
							allowFontScaling={false}
							maxFontSizeMultiplier={1}
							style={[
								styles.overlayMainText,
								isWellPass && styles.wellPassNameText,
								overlayCentered(activeOverlay.nameLine.y, frameWidth),
								{ fontSize: scaledFont(activeOverlay.nameLine.fontSize, activeOverlay.nameLine.fontScalingFactor) },
							]}
						>
							{displayName || DEFAULT_NAME}
							{!isWellPass && (
								<>
									{" \u00B7 "}
									{USC_ID}
								</>
							)}
						</Text>

						<Text
							allowFontScaling={false}
							maxFontSizeMultiplier={1}
							style={[
								styles.overlayMetaText,
								!isWellPass && styles.overlayCheckInText,
								!isWellPass && styles.tabularNumber,
								isWellPass && styles.wellPassMetaText,
								overlayCentered(activeOverlay.checkInLabel.y, frameWidth),
								{ fontSize: scaledFont(activeOverlay.checkInLabel.fontSize, activeOverlay.checkInLabel.fontScalingFactor) },
							]}
						>
							{checkInLine}
							{!isWellPass && (
								<>
									{" \u00B7 "}
									{timerText}
								</>
							)}
						</Text>

						<Text
							allowFontScaling={false}
							maxFontSizeMultiplier={1}
							style={[
								styles.overlayMetaText,
								isWellPass && styles.wellPassMetaText,
								locationPositionStyle,
								{ fontSize: scaledFont(activeOverlay.locationLabel.fontSize, activeOverlay.locationLabel.fontScalingFactor) },
							]}
						>
							{location}
						</Text>

						<Text
							allowFontScaling={false}
							maxFontSizeMultiplier={1}
							style={[
								styles.overlayMetaText,
								isWellPass && styles.wellPassMetaText,
								activityPositionStyle,
								{ fontSize: scaledFont(activeOverlay.activityLabel.fontSize, activeOverlay.activityLabel.fontScalingFactor) },
							]}
						>
							{activity}
						</Text>

						{!isWellPass && (
							<Text
								allowFontScaling={false}
								maxFontSizeMultiplier={1}
								style={[
									styles.overlayMetaText,
									styles.overlayMetaRight,
									overlayRightBox(
										activeOverlay.categoryLabel.y,
										activeOverlay.categoryLabel.leftPadding,
										activeOverlay.categoryLabel.rightPadding
									),
									{ fontSize: scaledFont(activeOverlay.categoryLabel.fontSize, activeOverlay.categoryLabel.fontScalingFactor) },
								]}
							>
								{category}
							</Text>
						)}

						<Pressable style={styles.hiddenCloseTapArea} onPress={() => setCheckInOpen(false)} />
					</View>
				</View>
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.root}>
			<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
				<Text style={styles.title}>Oğlum Scam Club</Text>

				<Pressable onPress={pickProfileImage} style={styles.profilePicker}>
					{profileUri ? (
						<Image source={{ uri: profileUri }} style={styles.profileImage} />
					) : (
						<Text style={styles.profilePlaceholder}>Selfie wählen</Text>
					)}
				</Pressable>

				<View style={styles.formRow}>
					<Text style={styles.formLabel}>Name</Text>
					<TextInput
						style={styles.input}
						value={displayName}
						onChangeText={setDisplayName}
						placeholder="Display Name"
						placeholderTextColor="#9ca3af"
					/>
				</View>

				<View style={styles.formRow}>
					<Text style={styles.formLabel}>Location</Text>
					<TextInput
						ref={locationRef}
						style={styles.input}
						value={location}
						onChangeText={setLocation}
						placeholder="Location"
						placeholderTextColor="#9ca3af"
					/>
				</View>

				<View style={styles.formRow}>
					<Text style={styles.formLabel}>Activity</Text>
					<TextInput
						ref={activityRef}
						style={styles.input}
						value={activity}
						onChangeText={setActivity}
						placeholder="Activity"
						placeholderTextColor="#9ca3af"
					/>
				</View>

				<View style={styles.formRow}>
					<Text style={[styles.formLabel, isWellPass && styles.formLabelDisabled]}>Category</Text>
					<TextInput
						ref={categoryRef}
						style={[styles.input, isWellPass && styles.inputDisabled]}
						value={isWellPass ? "" : category}
						onChangeText={setCategory}
						editable={!isWellPass}
						placeholder="Category"
						placeholderTextColor="#9ca3af"
					/>
				</View>

				<View style={styles.buttonRow}>
					<Pressable
						style={[styles.secondaryButton, mode === MODES.USC && styles.modeButtonSelected]}
						onPress={() => selectMode(MODES.USC)}
					>
						<Text style={styles.buttonText}>USC</Text>
					</Pressable>
					<Pressable
						style={[styles.secondaryButton, mode === MODES.WELLPASS && styles.modeButtonSelected]}
						onPress={() => selectMode(MODES.WELLPASS)}
					>
						<Text style={styles.buttonText}>WellPass</Text>
					</Pressable>
				</View>

				<View style={styles.buttonRow}>
					<Pressable
						style={[styles.secondaryButton, isLocationSaved && styles.secondaryButtonDisabled]}
						onPress={saveTemplate}
						disabled={isLocationSaved}
					>
						<Text style={[styles.buttonText, isLocationSaved && styles.buttonTextDisabled]}>
							{isLocationSaved ? "Saved" : "Save Location"}
						</Text>
					</Pressable>
					<Pressable style={styles.secondaryButton} onPress={() => setTemplateModalOpen(true)}>
						<Text style={styles.buttonText}>Load Location</Text>
					</Pressable>
				</View>

				<Pressable style={styles.primaryButton} onPress={openCheckIn}>
					<Text style={styles.primaryButtonText}>Check In</Text>
				</Pressable>

				<View style={styles.instructionsBox}>
					<Text style={styles.instructionsTitle}>How to use</Text>
					<Text style={styles.instructionsText}>{INSTRUCTIONS_TEXT}</Text>
				</View>
			</ScrollView>

			<Modal visible={isTemplateModalOpen} transparent animationType="fade" onRequestClose={() => setTemplateModalOpen(false)}>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<Text style={styles.modalTitle}>Gespeicherte Check-Ins</Text>

						{orderedTemplates.length === 0 ? (
							<Text style={styles.emptyText}>Noch keine Templates gespeichert.</Text>
						) : (
							orderedTemplates.map((item) => (
								<View key={item.id} style={styles.templateRow}>
									<Pressable style={styles.templateInfo} onPress={() => loadTemplate(item)}>
										<Text style={styles.templateLocation}>{item.location}</Text>
										<Text style={styles.templateSub}>
											{item.activity}
											{item.category ? ` | ${item.category}` : ""}
										</Text>
									</Pressable>
									<Pressable onPress={() => removeTemplate(item.id)} style={styles.deleteButton}>
										<Text style={styles.deleteText}>Delete</Text>
									</Pressable>
								</View>
							))
						)}

						<Pressable style={styles.modalClose} onPress={() => setTemplateModalOpen(false)}>
							<Text style={styles.buttonText}>Close</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0b0d13",
		paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0,
	},
	content: {
		paddingHorizontal: 20,
		paddingBottom: 28,
		paddingTop: 16,
		alignItems: "center",
		gap: 8,
	},
	title: {
		color: "#f9fafb",
		fontSize: 28,
		fontWeight: "700",
		marginBottom: 4,
	},
	profilePicker: {
		width: 130,
		height: 130,
		borderRadius: 65,
		borderWidth: 2,
		borderColor: "#374151",
		backgroundColor: "#111827",
		justifyContent: "center",
		alignItems: "center",
		overflow: "hidden",
		marginBottom: 4,
	},
	profileImage: {
		width: "100%",
		height: "100%",
	},
	profilePlaceholder: {
		color: "#d1d5db",
		fontSize: 14,
	},
	formRow: {
		width: "100%",
		maxWidth: 500,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	formLabel: {
		width: 90,
		color: "#d1d5db",
		fontSize: 15,
		fontWeight: "600",
	},
	formLabelDisabled: {
		color: "#6b7280",
	},
	input: {
		flex: 1,
		backgroundColor: "#111827",
		borderWidth: 1,
		borderColor: "#374151",
		color: "#f3f4f6",
		borderRadius: 10,
		paddingHorizontal: 14,
		height: 38,
		paddingVertical: 8,
		fontSize: 16,
	},
	inputDisabled: {
		backgroundColor: "#1a1f2b",
		borderColor: "#2a3140",
		color: "#6b7280",
	},
	buttonRow: {
		width: "100%",
		maxWidth: 500,
		flexDirection: "row",
		gap: 10,
		marginTop: 2,
	},
	secondaryButton: {
		flex: 1,
		borderWidth: 1,
		borderColor: "#4b5563",
		borderRadius: 10,
		paddingVertical: 12,
		alignItems: "center",
		backgroundColor: "#1f2937",
	},
	secondaryButtonDisabled: {
		backgroundColor: "#161b26",
		borderColor: "#30384a",
	},
	modeButtonSelected: {
		borderColor: "#7dd3fc",
		borderWidth: 2,
		backgroundColor: "#1e2a38",
	},
	buttonText: {
		color: "#f3f4f6",
		fontWeight: "600",
	},
	buttonTextDisabled: {
		color: "#6b7280",
	},
	primaryButton: {
		width: "100%",
		maxWidth: 500,
		borderRadius: 10,
		paddingVertical: 14,
		backgroundColor: "#22c55e",
		alignItems: "center",
		marginTop: 2,
	},
	primaryButtonText: {
		color: "#04110a",
		fontWeight: "800",
		fontSize: 16,
		letterSpacing: 0.4,
	},
	instructionsBox: {
		width: "100%",
		maxWidth: 500,
		marginTop: 6,
		backgroundColor: "#111827",
		borderWidth: 1,
		borderColor: "#374151",
		borderRadius: 12,
		padding: 12,
	},
	instructionsTitle: {
		color: "#f9fafb",
		fontWeight: "700",
		marginBottom: 8,
	},
	instructionsText: {
		color: "#d1d5db",
		lineHeight: 21,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.55)",
		justifyContent: "center",
		padding: 20,
	},
	modalCard: {
		backgroundColor: "#101623",
		borderWidth: 1,
		borderColor: "#334155",
		borderRadius: 12,
		padding: 14,
		gap: 10,
	},
	modalTitle: {
		color: "#f9fafb",
		fontSize: 18,
		fontWeight: "700",
	},
	emptyText: {
		color: "#9ca3af",
		marginVertical: 14,
	},
	templateRow: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#334155",
		borderRadius: 10,
		padding: 10,
		gap: 10,
	},
	templateInfo: {
		flex: 1,
	},
	templateLocation: {
		color: "#f3f4f6",
		fontWeight: "600",
	},
	templateSub: {
		color: "#9ca3af",
		marginTop: 2,
	},
	deleteButton: {
		borderWidth: 1,
		borderColor: "#7f1d1d",
		backgroundColor: "#450a0a",
		borderRadius: 8,
		paddingVertical: 8,
		paddingHorizontal: 10,
	},
	deleteText: {
		color: "#fecaca",
		fontWeight: "600",
	},
	modalClose: {
		marginTop: 4,
		borderWidth: 1,
		borderColor: "#4b5563",
		borderRadius: 10,
		paddingVertical: 10,
		alignItems: "center",
		backgroundColor: "#1f2937",
	},
	checkInRoot: {
		flex: 1,
		backgroundColor: "#000",
	},
	videoFrame: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	overlayLayer: {
		...StyleSheet.absoluteFillObject,
	},
	pulseCircle: {
		position: "absolute",
		backgroundColor: PULSE_COLOR,
	},
	avatarWrap: {
		position: "absolute",
		overflow: "hidden",
		backgroundColor: "#0f172a",
		borderWidth: 0,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarImg: {
		width: "100%",
		height: "100%",
	},
	avatarFallback: {
		color: "#f8fafc",
	},
	overlayMainText: {
		position: "absolute",
		color: "#ffffff",
		fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: undefined }),
		fontWeight: "650",
		letterSpacing: 0.3,
		textAlign: "center",
		backgroundColor: "#1A1E24",
	},
	overlayMetaText: {
		position: "absolute",
		color: "#c9d0db",
		fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: undefined }),
		fontWeight: "400",
		letterSpacing: 0.2,
		textAlign: "center",
		backgroundColor: "#1A1E24",
	},
	overlayCheckInText: {
		color: "#C2E0D8",
		letterSpacing: 0,
	},
	wellPassNameText: {
		color: "#000000",
		backgroundColor: "transparent",
		fontFamily: "Segoe UI",
		fontWeight: "600",
		letterSpacing: -0.5,
	},
	wellPassMetaText: {
		color: "#4b5563",
		backgroundColor: "transparent",
		fontFamily: "Segoe UI",
		fontWeight: "600",
	},
	overlayMetaRight: {
		textAlign: "right",
	},
	tabularNumber: {
		fontVariant: ["tabular-nums"],
		includeFontPadding: false,
	},
	hiddenCloseTapArea: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 120,
		height: 120,
		backgroundColor: "transparent",
	},
});
