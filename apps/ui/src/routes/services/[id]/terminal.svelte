<script context="module" lang="ts">
	import type { Load } from '@sveltejs/kit';
	export const load: Load = async ({ stuff }) => {
		return { props: { service: stuff.service } };
	};
</script>

<script lang="ts">
	export let service: any;
	import { page } from '$app/stores';
	import Terminal from '$lib/components/Terminal.svelte';

	const { id } = $page.params;
</script>

<div class="flex flex-col pt-2">
	<div class="flex items-center justify-between pb-2">
		<h2 class="title text-2xl">Terminal</h2>
		<span class="text-sm text-gray-400">Execute commands inside your running containers</span>
	</div>
	<Terminal resourceType="service" resourceId={id} />
</div>
