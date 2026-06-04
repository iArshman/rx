<script context="module" lang="ts">
	import type { Load } from '@sveltejs/kit';
	export const load: Load = async ({ stuff }) => {
		return { props: { database: stuff.database } };
	};
</script>

<script lang="ts">
	export let database: any;
	import { page } from '$app/stores';
	import Terminal from '$lib/components/Terminal.svelte';

	const { id } = $page.params;
</script>

<div class="flex flex-col pt-2">
	<div class="flex items-center justify-between pb-2">
		<h2 class="title text-2xl">Terminal</h2>
		<span class="text-sm text-gray-400">Execute commands inside your database container</span>
	</div>
	<Terminal resourceType="database" resourceId={id} />
</div>
