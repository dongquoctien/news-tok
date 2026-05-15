# Example prompts — edit an existing project

Replace `<id>` with a project ID under `data/projects/`.

> **Note for the orchestrator:** when you mutate `segment.scene`, use
> the lowercase kinds (`title` / `keypoint` / `quote` / `outro`) for
> built-ins, OR the PascalCase filename (without extension) of a
> custom scene under `data/projects/<id>/scenes/`. Never use
> `TitleCard` / `KeyPoint` / `Outro` as a built-in scene value — those
> are component filenames, not scene kinds.

## Change the narration text of one segment

```
In project <id>, change the text of segment 2 to:
"Three takeaways from the report: <new text>"
Re-render only that segment.
```

## Swap the background image

```
In project <id>, segment 3 currently uses a photo of an office. Find a
photo of a server room instead, swap it in, and re-render that segment.
```

## Change the voice for the whole project

```
In project <id>, switch every segment to use vi-VN-NamMinhNeural and
re-render the full project.
```

## Adjust durations

```
In project <id>, make segments 1 and 5 last 4 seconds instead of 8. Keep
the same text. Re-render the project.
```

## Add a custom visual effect

```
In project <id>, segment 2 needs a cyberpunk-style glitch effect (RGB
split, chromatic aberration on the text). Fork the relevant scene into
data/projects/<id>/scenes/CyberpunkGlitch.tsx, point segment 2 at it, and
re-render that segment.
```

## Reorder segments

```
In project <id>, move segment 4 to be after segment 1, then re-render the
full project.
```
