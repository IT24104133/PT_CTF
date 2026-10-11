# PT_CTF - Solstice CTF

## Vaaranan J - IT24104133

This branch imports the existing Stage 2 EXIF and Stage 3 PeopleHub components,
with platform architecture notes, for the responsibility split agreed by the group.
Branch: `vaaranan/IT24104133`.

This is a component contribution to the shared project. The complete playable app
still requires the outer server, outer seed orchestration, and the other members'
stages. There is no `npm start` command on this component branch yet.

### Included

- Stage 2: EXIF evidence page, gate, metadata reader/writer, answer parsers, and source photo.
- Stage 3: PeopleHub frontend and backend, sessions, roles, challenge tracking,
  database schema, synthetic data generators, and sandbox fixtures.
- Shared dependencies: outer-page styles/audio and the XML resolver needed by PeopleHub.
- [Platform architecture](docs/architecture.md) and
  [contribution scope and integration notes](docs/contributions/IT24104133.md).

### Component checks

Use Node.js 22.5 or newer (`node:sqlite` is required). No npm packages are needed.

```sh
npm run seed:peoplehub
npm run inspect:exif
```

The first command creates/replaces the **local checkout's** generated
`data/db/peoplehub.sqlite`. Run it only when no process has that database open.
The database and generated runtime files are ignored by Git.

### Integration

The outer server must provide the CTF session and stage gates before mounting
PeopleHub. See the contribution notes for the required routes and shared files.
This branch preserves the copied source files; it does not replace the running
local app or include the other members' standalone stages.

The application contains intentional vulnerabilities and synthetic CTF data.
The source and seed files contain challenge material, so repository access also
provides access to implementation details used in solving the game.
