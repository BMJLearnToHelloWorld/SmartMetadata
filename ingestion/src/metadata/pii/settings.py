#  Copyright 2026 Collate
#  Licensed under the Collate Community License, Version 1.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  https://github.com/open-metadata/OpenMetadata/blob/main/ingestion/LICENSE
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
"""spaCy classification-model provisioning settings (OM_SPACY_MODEL_*)."""

from pydantic import Field
from pydantic_settings import SettingsConfigDict

from metadata.config.settings import OMSettings, om_settings


@om_settings
class SpacyModelSettings(OMSettings):
    """Mirrors and local wheels for spaCy model provisioning (OM_SPACY_MODEL_*)."""

    model_config = SettingsConfigDict(env_prefix="OM_SPACY_MODEL_")

    wheel_dir: str | None = Field(
        default=None,
        description=(
            "Directory containing pre-downloaded `{model}-{version}-py3-none-any.whl` files. "
            "When set and the wheel exists, pip tries it before release URLs (CI cache / air gap)."
        ),
    )
    base_url: str = Field(
        default="",
        description=(
            "Primary GitHub Releases download base, including the `.../releases/download` suffix. "
            "Prepended before `/release/wheel` when resolving wheel URLs."
        ),
    )
    mirrors: str = Field(
        default="",
        description="Comma-separated extra download bases tried after the primary URL fails.",
    )


def spacy_model_settings() -> SpacyModelSettings:
    """Read current OM_SPACY_MODEL_* values (fresh instance for test/env isolation)."""
    return SpacyModelSettings()
