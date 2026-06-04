<script context="module" lang="ts">
	import type { Load } from '@sveltejs/kit';
	export const load: Load = async ({ params, stuff }) => {
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
	import Terminal from '$lib/components/Terminal.svelte';
	import { status } from '$lib/store';

	const { id } = $page.params;
</script>

<div class="flex flex-col pt-2">
	<div class="flex items-center justify-between pb-2">
		<h2 class="title text-2xl">Terminal</h2>
		<span class="text-sm text-gray-400">
			Execute commands inside your running containers
		</span>
	</div>

	{#if $status.application.overallStatus !== 'healthy' && $status.application.overallStatus !== 'degraded'}
		<div class="flex items-center gap-3 p-4 rounded bg-coolgray-200 text-yellow-400">
			<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
				<path d="M12 9v2m0 4v.01"/>
				<path d="M5 19h14a2 2 0 0 0 1.84-2.75l-7.1-12.25a2 2 0 0 0-3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75"/>
			</svg>
			Application is not running. Start it first to use the terminal.
		</div>
	{:else}
		<Terminal resourceType="application" resourceId={id} />
	{/if}
</div>
