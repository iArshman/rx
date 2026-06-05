<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { io } from '$lib/store';
	import { get } from '$lib/api';
	import { errorNotification } from '$lib/common';

	export let resourceType: 'application' | 'service' | 'database';
	export let resourceId: string;

	let terminal: any = null;
	let fitAddon: any = null;
	let terminalEl: HTMLElement;
	let wrapperEl: HTMLElement;

	let containers: Array<{ name: string; destinationId: string }> = [];
	let selectedContainer = '';
	let selectedDestinationId = '';

	type Status = 'idle' | 'connecting' | 'connected' | 'exited' | 'error';
	let status: Status = 'idle';
	let errorMsg = '';
	let loadingContainers = false;
	let fullscreen = false;

	async function loadContainers() {
		loadingContainers = true;
		try {
			const endpoint =
				resourceType === 'database'
					? `/terminal/${resourceType}/${resourceId}/container`
					: `/terminal/${resourceType}/${resourceId}/containers`;
			const data = await get(endpoint);
			containers = data.containers ?? [];
			if (containers.length === 1) {
				selectedContainer = containers[0].name;
				selectedDestinationId = containers[0].destinationId;
			}
		} catch (err) {
			errorNotification(err);
		} finally {
			loadingContainers = false;
		}
	}

	async function initTerminal() {
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');
		await import('@xterm/xterm/css/xterm.css');

		terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			disableStdin: true,
			theme: {
				background: '#000000',
				foreground: '#e0e0e0',
				cursor: '#a0a0a0'
			},
			scrollback: 5000
		});

		fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(terminalEl);
		await new Promise((r) => requestAnimationFrame(r));
		fitAddon.fit();

		terminal.onData((data: string) => {
			if (status === 'connected') {
				io.emit('terminal:input', { data });
			}
		});

		window.addEventListener('resize', handleResize);
	}

	function handleResize() {
		if (!fitAddon || !terminal) return;
		fitAddon.fit();
		io.emit('terminal:resize', { cols: terminal.cols, rows: terminal.rows });
	}

	function setupSocketListeners() {
		io.on('terminal:ready', () => {
			status = 'connected';
			terminal?.clear();
			if (terminal) terminal.options.disableStdin = false;
			terminal?.focus();
			fitAddon?.fit();
		});

		io.on('terminal:data', ({ data }: { data: string }) => {
			terminal?.write(data);
		});

		io.on('terminal:exit', ({ exitCode }: { exitCode: number }) => {
			status = 'exited';
			if (terminal) terminal.options.disableStdin = true;
			terminal?.writeln(`\r\n\x1b[33m[Session ended (exit code: ${exitCode})]\x1b[0m`);
		});

		io.on('terminal:error', ({ message }: { message: string }) => {
			status = 'error';
			errorMsg = message;
			if (terminal) terminal.options.disableStdin = true;
			terminal?.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
		});
	}

	function removeSocketListeners() {
		io.off('terminal:ready');
		io.off('terminal:data');
		io.off('terminal:exit');
		io.off('terminal:error');
	}

	async function connect() {
		if (!selectedContainer || !selectedDestinationId) return;
		if (!terminal) await initTerminal();

		status = 'connecting';
		terminal.clear();
		terminal.writeln('\x1b[90mConnecting...\x1b[0m');

		io.connect();
		io.emit('terminal:connect', {
			containerName: selectedContainer,
			destinationId: selectedDestinationId
		});
	}

	function disconnect() {
		io.emit('terminal:kill');
		if (terminal) terminal.options.disableStdin = true;
		status = 'idle';
	}

	function toggleFullscreen() {
		fullscreen = !fullscreen;
		setTimeout(handleResize, 50);
	}

	onMount(async () => {
		await loadContainers();
		setupSocketListeners();
	});

	onDestroy(() => {
		disconnect();
		removeSocketListeners();
		window.removeEventListener('resize', handleResize);
		terminal?.dispose();
	});

	function onContainerChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		const found = containers.find((c) => c.name === val);
		selectedContainer = val;
		selectedDestinationId = found?.destinationId ?? '';
	}
</script>

<div class="flex flex-col gap-4 pt-4">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-3">
		{#if loadingContainers}
			<span class="text-sm text-gray-400">Loading containers…</span>
		{:else if containers.length === 0}
			<span class="text-sm text-yellow-400">No running containers found.</span>
		{:else}
			<select
				class="select select-sm select-bordered bg-coolgray-200 max-w-xs"
				value={selectedContainer}
				on:change={onContainerChange}
			>
				<option value="">Select container</option>
				{#each containers as c}
					<option value={c.name}>{c.name}</option>
				{/each}
			</select>

			{#if status === 'idle' || status === 'exited' || status === 'error'}
				<button
					class="btn btn-sm bg-coollabs gap-2"
					disabled={!selectedContainer}
					on:click={connect}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="4 17 10 11 4 5"/>
						<line x1="12" y1="19" x2="20" y2="19"/>
					</svg>
					Connect
				</button>
			{:else if status === 'connecting'}
				<button class="btn btn-sm btn-ghost gap-2 loading" disabled>
					Connecting…
				</button>
			{:else if status === 'connected'}
				<button class="btn btn-sm btn-error gap-2" on:click={disconnect}>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="6" y="5" width="4" height="14" rx="1"/>
						<rect x="14" y="5" width="4" height="14" rx="1"/>
					</svg>
					Disconnect
				</button>
			{/if}

			{#if status === 'connected' || status === 'exited'}
				<button class="btn btn-sm btn-ghost" on:click={toggleFullscreen} title="Toggle fullscreen">
					{#if fullscreen}
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M6 14h4m0 0v4m0-4l-6 6m14-10h-4m0 0V6m0 4l6-6"/>
						</svg>
					{:else}
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M4 8v-2a2 2 0 0 1 2 -2h2m8 0h2a2 2 0 0 1 2 2v2m0 8v2a2 2 0 0 1 -2 2h-2m-8 0h-2a2 2 0 0 1 -2 -2v-2"/>
						</svg>
					{/if}
				</button>
			{/if}
		{/if}
	</div>

	<!-- Terminal window -->
	<div
		bind:this={wrapperEl}
		class:fixed={fullscreen}
		class:inset-0={fullscreen}
		class:z-50={fullscreen}
		class="rounded-lg bg-coolgray-200 p-3"
		style={fullscreen ? '' : 'height:500px'}
	>
		<div class="w-full h-full rounded overflow-hidden bg-black p-2">
			<div bind:this={terminalEl} class="w-full h-full" />
		</div>
	</div>
</div>

<style>
	:global(.xterm) { height: 100%; }
	:global(.xterm-viewport) { overflow-y: auto !important; }
	:global(.xterm-screen) { height: 100% !important; }
</style>
