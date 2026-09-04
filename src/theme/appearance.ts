export function setEffectsClass(enabled: boolean) {
	const root = document.documentElement;
	root.classList.toggle("effects-on", enabled);
	root.classList.toggle("effects-off", !enabled);
}
