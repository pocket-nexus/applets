<template>
  <footer>
    <div class="inner">
      <p>© 2026 <a href="https://pocket.nexus/">Pocket Nexus</a>. Applets are built with <a href="https://pocketjs.dev/">PocketJS</a>.</p>
      <nav aria-label="More">
        <a href="https://github.com/pocket-nexus/applets">Source</a>
        <a href="/v1/apps">API</a>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
footer {
  border-top: 1px solid var(--line-soft);
  font-size: 13px;
  color: var(--text-3);
}

.inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 24px;
  max-width: calc(var(--page) + 2 * var(--gutter));
  margin: 0 auto;
  padding: 22px var(--gutter) 28px;
}

nav {
  display: flex;
  gap: 20px;
}

a {
  color: var(--text-2);
}

a:hover {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
