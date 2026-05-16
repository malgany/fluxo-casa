# Icon Pattern

SVG file pattern:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Service Name">
  <rect width="64" height="64" rx="16" fill="#123456"/>
  <text x="32" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#ffffff">Name</text>
</svg>
```

Registry pattern in `src/domain/iconRegistry.ts`:

```ts
{
  id: "service-name",
  label: "Service Name",
  src: "/service-icons/service-name.svg",
  aliases: ["service name", "common term", "categoria"]
}
```

The app displays selected icons through `iconId`; if no icon is selected, `TimelineIcon` shows the first letter of the title.
