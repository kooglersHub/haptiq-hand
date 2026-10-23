# Third-party material

The public snapshot includes bundled hand meshes, sensor CAD, and reference
documents with redistribution permission confirmed by the repository owner.
This confirmation does not assign a new blanket license to those assets.
Retain upstream notices and obtain the applicable terms from each source.

- HaptIQ application lineage: [rht2001/haptiq](https://github.com/rht2001/haptiq).
- Hand geometry and URDF provenance: see
  `src/haptiq/digital_twin/joint_asset_manifest.json`, including pinned source commits,
  URLs, and hashes from
  [AlexArutiunian/tactile-rh56dftp](https://github.com/AlexArutiunian/tactile-rh56dftp).
- Sensor CAD: VEGABAR 29 and VEGABAR 38 STL exports under `src/haptiq/assets/models/` and original STEP exports under `documents/`, as identified
  by the embedded model source names and SHA-256 hashes.
- Hardware reference: RH56DFTP user manual under `documents/`.

Python and JavaScript dependencies are obtained separately through their
package managers and retain their own licenses. No vendored dependency code
or private Git history is added by this snapshot release.
