<script context="module" lang="ts">
	import type { Load } from '@sveltejs/kit';
	export const load: Load = async ({ stuff }) => {
		return {
			props: {
				application: stuff.application
			}
		};
	};
</script>

<script lang="ts">
	export let application: any;
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { get, post, del } from '$lib/api';
	import { status } from '$lib/store';
	import { addToast } from '$lib/store';
	import { errorNotification } from '$lib/common';
	import Tooltip from '$lib/components/Tooltip.svelte';

	const { id } = $page.params;

	// ── Metrics ──────────────────────────────────────────────────────────
	let services: any = [];
	let selectedService: any = null;
	let usageLoading = false;
	let usage = { MemUsage: 0, CPUPerc: 0, NetIO: 0 };
	let usageInterval: any;

	async function getUsage() {
		if (usageLoading) return;
		usageLoading = true;
		try {
			const data = await get(`/applications/${id}/usage/${selectedService}`);
			usage = data.usage;
		} catch (err) {
			console.log('[v0] getUsage error:', err);
		} finally {
			usageLoading = false;
		}
	}

	function normalizeDockerServices(services: any[]) {
		return Object.entries(services).map(([name, data]) => ({ name, data }));
	}

	async function selectService(service: any) {
		if (usageInterval) clearInterval(usageInterval);
		usageLoading = false;
		usage = { MemUsage: 0, CPUPerc: 0, NetIO: 0 };
		selectedService = `${application.id}${service.name ? `-${service.name}` : ''}`;
		await getUsage();
		usageInterval = setInterval(async () => { await getUsage(); }, 1000);
	}

	// ── Resource Limits ───────────────────────────────────────────────────
	let cpuLimit = '';
	let memoryLimit = '';
	let savingLimits = false;
	let removingLimits = false;

	async function saveLimits() {
		try {
			savingLimits = true;
			await post(`/applications/${id}/limits`, { cpuLimit, memoryLimit });
			addToast({ message: 'Resource limits saved. Restarting app...', type: 'success' });
		} catch (err) {
			errorNotification(err);
		} finally {
			savingLimits = false;
		}
	}

	async function removeLimits() {
		const sure = confirm('Remove all resource limits?');
		if (!sure) return;
		try {
			removingLimits = true;
			await del(`/applications/${id}/limits`);
			cpuLimit = '';
			memoryLimit = '';
			addToast({ message: 'Resource limits removed. Restarting app...', type: 'success' });
		} catch (err) {
			errorNotification(err);
		} finally {
			removingLimits = false;
		}
	}

	onDestroy(() => { clearInterval(usageInterval); });

	onMount(async () => {
		const response = await get(`/applications/${id}`);
		application = response.application;
		cpuLimit = application.cpuLimit || '';
		memoryLimit = application.memoryLimit || '';
		if (response.application.dockerComposeFile && application.buildPack === 'compose') {
			services = normalizeDockerServices(JSON.parse(response.application.dockerComposeFile).services);
		} else {
			services = [{ name: '' }];
			await selectService('');
		}
	});
</script>

<div class="mx-auto w-full">

	<!-- ── Metrics ────────────────────────────────────────────── -->
	<div class="flex flex-row border-b border-coolgray-500 mb-6 space-x-2">
		<div class="title font-bold pb-3">Metrics</div>
	</div>

	<div class="flex gap-2 lg:gap-8 pb-4">
		{#each services as service}
			<button
				on:click={() => selectService(service)}
				class:bg-primary={selectedService === `${application.id}${service.name ? `-${service.name}` : ''}`}
				class:bg-coolgray-200={selectedService !== `${application.id}${service.name ? `-${service.name}` : ''}`}
				class="w-full rounded p-5 hover:bg-primary font-bold"
			>
				{application.id}{service.name ? `-${service.name}` : ''}
			</button>
		{/each}
	</div>

	{#if selectedService}
		<div class="mx-auto max-w-4xl px-6 py-4 bg-coolgray-100 border border-coolgray-200 relative mb-10">
			{#if usageLoading}
				<button id="streaming" class="btn btn-sm bg-transparent border-none loading absolute top-0 left-0 text-xs" />
				<Tooltip triggeredBy="#streaming">Streaming live</Tooltip>
			{/if}
			<div class="text-center">
				<div class="stat w-64">
					<div class="stat-title">Used Memory / Memory Limit</div>
					<div class="stat-value text-xl">{usage?.MemUsage}</div>
				</div>
				<div class="stat w-64">
					<div class="stat-title">Used CPU</div>
					<div class="stat-value text-xl">{usage?.CPUPerc}</div>
				</div>
				<div class="stat w-64">
					<div class="stat-title">Network IO</div>
					<div class="stat-value text-xl">{usage?.NetIO}</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Resource Limits ────────────────────────────────────── -->
	<div class="flex flex-row border-b border-coolgray-500 mb-6 space-x-2">
		<div class="title font-bold pb-3">Resource Limits</div>
	</div>

	<div class="max-w-lg space-y-4">
		<div class="grid grid-cols-2 items-center gap-4">
			<label for="cpuLimit" class="text-sm font-medium">
				CPU Limit
				<span class="block text-xs text-stone-400">e.g. 0.5 = half core, 1 = 1 core</span>
			</label>
			<input
				id="cpuLimit"
				type="text"
				placeholder="e.g. 0.5"
				bind:value={cpuLimit}
				class="w-full input input-sm bg-coolgray-200"
			/>
		</div>

		<div class="grid grid-cols-2 items-center gap-4">
			<label for="memoryLimit" class="text-sm font-medium">
				Memory Limit
				<span class="block text-xs text-stone-400">e.g. 512m, 1g, 2g</span>
			</label>
			<input
				id="memoryLimit"
				type="text"
				placeholder="e.g. 512m"
				bind:value={memoryLimit}
				class="w-full input input-sm bg-coolgray-200"
			/>
		</div>

		<div class="flex gap-3 pt-2">
			<button
				class="btn btn-sm bg-coollabs"
				class:loading={savingLimits}
				disabled={savingLimits || (!cpuLimit && !memoryLimit)}
				on:click={saveLimits}
			>
				Save Limits
			</button>
			{#if application?.cpuLimit || application?.memoryLimit}
				<button
					class="btn btn-sm btn-error"
					class:loading={removingLimits}
					disabled={removingLimits}
					on:click={removeLimits}
				>
					Remove Limits
				</button>
			{/if}
		</div>
	</div>

</div>
