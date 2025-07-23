<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
    <RouterView v-slot="{ Component }">
      <Suspense>
        <Transition name="page-transition" mode="out-in">
          <Component :is="Component"/>
        </Transition>
      </Suspense>
    </RouterView>
</template>
