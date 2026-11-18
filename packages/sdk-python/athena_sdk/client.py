"""Client Python de l'API Athena. Code généré par tools/gen-sdk.mjs depuis le contrat OpenAPI : ne pas modifier à la main."""
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


class AthenaError(Exception):
    """Réponse HTTP non 2xx."""

    def __init__(self, status: int, body: Any):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.body = body


class _Group:
    def __init__(self, client: "AthenaClient"):
        self._client = client

class _Access(_Group):
    def export_members(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/export-control (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/export-control".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/access-lists (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/access-lists".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/access-lists (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/access-lists".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("DELETE", path, query=query)
    def set(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/access-lists (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/access-lists".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def set_export_members(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/export-control (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/export-control".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def set_marking(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/artifacts/{key}/marking (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/artifacts/{key}/marking".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Agile(_Group):
    def add_item(self, project, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/sprints/{id}/items (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/sprints/{id}/items".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def assign_release(self, project, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/releases/{id}/items (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/releases/{id}/items".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def backlog(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/backlog (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/backlog".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def board(self, project, board, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/boards/{board} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/boards/{board}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{board}", urllib.parse.quote(str(board), safe=""))
        return self._client.request("GET", path, query=query)
    def board_list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/boards (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/boards".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def burndown(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/sprints/{id}/burndown (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/sprints/{id}/burndown".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def close(self, project, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/sprints/{id}/close (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/sprints/{id}/close".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def code_quality(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/quality (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/quality".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def create_board(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/boards (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/boards".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_release(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/releases (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/releases".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_sprint(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/sprints (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/sprints".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def dashboard(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/dashboard (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/dashboard".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def flow(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/flow (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/flow".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def item_sprint(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/sprint (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/sprint".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def kpis(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/kpis (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/kpis".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def move(self, project, board, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/boards/{board}/cards/{key}/move (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/boards/{board}/cards/{key}/move".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{board}", urllib.parse.quote(str(board), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def pipeline_runs(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/pipelines (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/pipelines".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def publish_release(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/releases/{id}/publish (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/releases/{id}/publish".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query)
    def rank_backlog(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/backlog/rank (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/backlog/rank".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def release_items(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/releases/{id}/items (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/releases/{id}/items".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def remove_item(self, project, id, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/sprints/{id}/items/{key} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/sprints/{id}/items/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def roadmap(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/roadmap (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/roadmap".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def sprint(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/sprints/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/sprints/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def sprint_list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/sprints (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/sprints".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def start(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/sprints/{id}/start (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/sprints/{id}/start".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query)
    def unassign_release(self, project, id, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/releases/{id}/items/{key} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/releases/{id}/items/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def velocity(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/velocity (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/velocity".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)


class _Allocation(_Group):
    def add(self, p, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{p}/allocations (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{p}/allocations".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def list(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/allocations (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/allocations".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, p, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{p}/allocations/{id} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{p}/allocations/{id}".replace("{p}", urllib.parse.quote(str(p), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)


class _Appearance(_Group):
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/appearance (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/appearance"
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/appearance (rôles : athena-admin)"""
        path = "/v1/admin/appearance"
        return self._client.request("PUT", path, query=query, body=body)


class _Approval(_Group):
    def decide(self, project, type, ref, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/approvals/{type}/{ref}/decision (rôles : athena-qa)"""
        path = "/v1/projects/{project}/approvals/{type}/{ref}/decision".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{type}", urllib.parse.quote(str(type), safe="")).replace("{ref}", urllib.parse.quote(str(ref), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/approvals (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/approvals".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def set_required(self, project, type, ref, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/approvals/{type}/{ref}/required (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/approvals/{type}/{ref}/required".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{type}", urllib.parse.quote(str(type), safe="")).replace("{ref}", urllib.parse.quote(str(ref), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Attachment(_Group):
    def download(self, project, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/attachments/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/attachments/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/attachments (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/attachments".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, project, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/artifacts/{key}/attachments/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/attachments/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def upload(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/attachments (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/attachments".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _Bff(_Group):
    def backchannel_logout(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /auth/backchannel-logout (public)"""
        path = "/auth/backchannel-logout"
        return self._client.request("POST", path, query=query, body=body)
    def callback(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /auth/callback (public)"""
        path = "/auth/callback"
        return self._client.request("GET", path, query=query)
    def login(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /auth/login (public)"""
        path = "/auth/login"
        return self._client.request("GET", path, query=query)
    def logout(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /auth/logout (public)"""
        path = "/auth/logout"
        return self._client.request("POST", path, query=query)
    def session(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /auth/session (public)"""
        path = "/auth/session"
        return self._client.request("GET", path, query=query)


class _Brand(_Group):
    def image(self, theme, kind, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/brand/{theme}/{kind} (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/brand/{theme}/{kind}".replace("{theme}", urllib.parse.quote(str(theme), safe="")).replace("{kind}", urllib.parse.quote(str(kind), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/brand (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/brand"
        return self._client.request("GET", path, query=query)
    def remove(self, theme, kind, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/admin/brand/{theme}/{kind} (rôles : athena-admin)"""
        path = "/v1/admin/brand/{theme}/{kind}".replace("{theme}", urllib.parse.quote(str(theme), safe="")).replace("{kind}", urllib.parse.quote(str(kind), safe=""))
        return self._client.request("DELETE", path, query=query)
    def upload(self, theme, kind, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/brand/{theme}/{kind} (rôles : athena-admin)"""
        path = "/v1/admin/brand/{theme}/{kind}".replace("{theme}", urllib.parse.quote(str(theme), safe="")).replace("{kind}", urllib.parse.quote(str(kind), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Calendar(_Group):
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/calendar (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/calendar"
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/calendar (rôles : athena-admin)"""
        path = "/v1/admin/calendar"
        return self._client.request("PUT", path, query=query, body=body)


class _Capacity(_Group):
    def absences(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/capacity/absences (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/absences"
        return self._client.request("GET", path, query=query)
    def add_absence(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/capacity/absences (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/absences"
        return self._client.request("POST", path, query=query, body=body)
    def add_availability(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/capacity/availability (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/availability"
        return self._client.request("POST", path, query=query, body=body)
    def availability(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/capacity/availability (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/availability"
        return self._client.request("GET", path, query=query)
    def remove_absence(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/capacity/absences/{id} (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/absences/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def remove_availability(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/capacity/availability/{id} (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity/availability/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def view(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/capacity (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/capacity"
        return self._client.request("GET", path, query=query)


class _Core(_Group):
    def add_comment(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/comments (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/comments".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def add_field(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/trackers/{tracker}/fields (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/fields".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def add_status(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/trackers/{tracker}/statuses (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/statuses".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def add_transition(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/trackers/{tracker}/transitions (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/transitions".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def clear_suspect(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/links/{id}/clear-suspect (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/links/{id}/clear-suspect".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query)
    def comments(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/comments (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/comments".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def create_artifact(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/trackers/{tracker}/artifacts (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/trackers/{tracker}/artifacts".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_link_type(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/link-types (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/link-types".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_project(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects (rôles : athena-admin)"""
        path = "/v1/projects"
        return self._client.request("POST", path, query=query, body=body)
    def create_tracker(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/trackers (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def field_impact(self, project, tracker, field, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/trackers/{tracker}/fields/{field}/impact (rôles : athena-admin)"""
        path = "/v1/projects/{project}/trackers/{tracker}/fields/{field}/impact".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe="")).replace("{field}", urllib.parse.quote(str(field), safe=""))
        return self._client.request("GET", path, query=query)
    def get_artifact(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def get_tracker(self, project, tracker, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/trackers/{tracker} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/trackers/{tracker}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("GET", path, query=query)
    def history(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/history (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/history".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def link(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/links (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/links".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def list_links(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/links (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/links".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def list_link_types(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/link-types (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/link-types".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def list_projects(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects"
        return self._client.request("GET", path, query=query)
    def list_trackers(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/trackers (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/trackers".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def patch_status(self, project, tracker, status, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/trackers/{tracker}/statuses/{status} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/statuses/{status}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe="")).replace("{status}", urllib.parse.quote(str(status), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def remove_field(self, project, tracker, field, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/trackers/{tracker}/fields/{field} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/fields/{field}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe="")).replace("{field}", urllib.parse.quote(str(field), safe=""))
        return self._client.request("DELETE", path, query=query)
    def remove_link(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/links/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/links/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def restore(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/restore (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/restore".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def search(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/search (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/search".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def set_history_mode(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/trackers/{tracker}/history-mode (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/history-mode".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def set_layout(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/trackers/{tracker}/layout (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/layout".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def set_type(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/trackers/{tracker}/type (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/type".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def transition(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/transitions (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/transitions".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def update_artifact(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/artifacts/{key} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def update_field(self, project, tracker, field, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/trackers/{tracker}/fields/{field} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/fields/{field}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe="")).replace("{field}", urllib.parse.quote(str(field), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)


class _Coverage(_Group):
    def create_org(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/coverage-rules (rôles : athena-admin)"""
        path = "/v1/coverage-rules"
        return self._client.request("POST", path, query=query, body=body)
    def create_project(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/coverage-rules (rôles : athena-admin)"""
        path = "/v1/projects/{project}/coverage-rules".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def evaluate(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/coverage (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/coverage".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def org_rules(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/coverage-rules (rôles : athena-team-member, athena-admin)"""
        path = "/v1/coverage-rules"
        return self._client.request("GET", path, query=query)
    def remove_org(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/coverage-rules/{key} (rôles : athena-admin)"""
        path = "/v1/coverage-rules/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def remove_project(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/coverage-rules/{key} (rôles : athena-admin)"""
        path = "/v1/projects/{project}/coverage-rules/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def update_org(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/coverage-rules/{key} (rôles : athena-admin)"""
        path = "/v1/coverage-rules/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def update_project(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/coverage-rules/{key} (rôles : athena-admin)"""
        path = "/v1/projects/{project}/coverage-rules/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Dashboard(_Group):
    def awaiting(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/approvals (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/approvals"
        return self._client.request("GET", path, query=query)
    def catalog(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/dashboard/catalog (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/dashboard/catalog"
        return self._client.request("GET", path, query=query)
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/dashboard (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/dashboard"
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/dashboard (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/dashboard"
        return self._client.request("PUT", path, query=query, body=body)
    def reset(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/me/dashboard (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/dashboard"
        return self._client.request("DELETE", path, query=query)


class _Dependency(_Group):
    def add(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/dependencies (rôles : athena-admin, athena-pmo)"""
        path = "/v1/dependencies"
        return self._client.request("POST", path, query=query, body=body)
    def graph(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/dependencies (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/dependencies".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def propagate(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/dependencies/propagate (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/dependencies/propagate"
        return self._client.request("POST", path, query=query, body=body)
    def remove(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/dependencies/{id} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/dependencies/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)


class _Doc(_Group):
    def acknowledge(self, project, key, source, uid, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/doc-links/{source}/{uid}/acknowledge (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/artifacts/{key}/doc-links/{source}/{uid}/acknowledge".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{source}", urllib.parse.quote(str(source), safe="")).replace("{uid}", urllib.parse.quote(str(uid), safe=""))
        return self._client.request("POST", path, query=query)
    def citations(self, project, uid, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs/nodes/{uid}/citations (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/docs/nodes/{uid}/citations".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{uid}", urllib.parse.quote(str(uid), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/docs".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def node(self, project, uid, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs/nodes/{uid} (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/docs/nodes/{uid}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{uid}", urllib.parse.quote(str(uid), safe=""))
        return self._client.request("GET", path, query=query)
    def search(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs/search (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/docs/search".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def tree(self, project, doc, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs/{doc}/tree (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/docs/{doc}/tree".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{doc}", urllib.parse.quote(str(doc), safe=""))
        return self._client.request("GET", path, query=query)


class _Feature(_Group):
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/features (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/features"
        return self._client.request("GET", path, query=query)
    def set(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/features/{key} (rôles : athena-admin)"""
        path = "/v1/admin/features/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Finance(_Group):
    def actual(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/finance/actuals (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/actuals"
        return self._client.request("POST", path, query=query, body=body)
    def budget(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/finance/budget (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/budget"
        return self._client.request("POST", path, query=query, body=body)
    def categories(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/finance/categories (rôles : athena-admin, athena-finance, athena-pmo, athena-director)"""
        path = "/v1/finance/categories"
        return self._client.request("GET", path, query=query)
    def category(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/finance/categories (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/categories"
        return self._client.request("PUT", path, query=query, body=body)
    def commitment(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/finance/commitments (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/commitments"
        return self._client.request("POST", path, query=query, body=body)
    def forecast(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/finance/forecasts (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/forecasts"
        return self._client.request("PUT", path, query=query, body=body)
    def import_actuals(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/finance/actuals/import (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/actuals/import"
        return self._client.request("POST", path, query=query, body=body)
    def project(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/finance/projects/{p} (rôles : athena-admin, athena-finance, athena-pmo, athena-director)"""
        path = "/v1/finance/projects/{p}".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def rate(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/finance/rates (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/rates"
        return self._client.request("POST", path, query=query, body=body)
    def rates(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/finance/rates (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/rates"
        return self._client.request("GET", path, query=query)
    def time_cost(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/finance/projects/{p}/time-cost (rôles : athena-admin, athena-finance)"""
        path = "/v1/finance/projects/{p}/time-cost".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)


class _Graphql(_Group):
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/graphql (rôles : athena-team-member, athena-admin)"""
        path = "/v1/graphql"
        return self._client.request("GET", path, query=query)
    def post(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/graphql (rôles : athena-team-member, athena-admin)"""
        path = "/v1/graphql"
        return self._client.request("POST", path, query=query, body=body)


class _Health(_Group):
    def admin_ping(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/admin/ping (rôles : athena-admin)"""
        path = "/v1/admin/ping"
        return self._client.request("GET", path, query=query)
    def health(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /healthz (public)"""
        path = "/healthz"
        return self._client.request("GET", path, query=query)
    def me(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me"""
        path = "/v1/me"
        return self._client.request("GET", path, query=query)


class _Integrations(_Group):
    def add_code_repo(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/code-repos (rôles : athena-admin)"""
        path = "/v1/projects/{project}/code-repos".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def backports(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/backports (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/backports".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def cancel_backport(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/backports/cancel (rôles : athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/backports/cancel".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def code_refs(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/code-refs (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/code-refs".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def code_repos(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/code-repos (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/code-repos".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def coverage(self, project, source, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/docs/{source}/coverage (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/docs/{source}/coverage".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{source}", urllib.parse.quote(str(source), safe=""))
        return self._client.request("GET", path, query=query)
    def create_baseline(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/baselines (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/baselines".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_branch(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/branch (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/branch".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_inbound(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/inbound-sources (rôles : athena-admin)"""
        path = "/v1/projects/{project}/inbound-sources".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_merge_request(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/merge-request (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/merge-request".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_rule(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/automations (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/automations".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def create_webhook(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/webhooks (rôles : athena-admin)"""
        path = "/v1/webhooks"
        return self._client.request("POST", path, query=query, body=body)
    def deliveries(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/webhooks/{id}/deliveries (rôles : athena-admin)"""
        path = "/v1/webhooks/{id}/deliveries".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def diff_baselines(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/baselines-diff (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/baselines-diff".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def doc_link(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/doc-links (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/doc-links".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def doc_links(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/doc-links (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/doc-links".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def dora(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/dora (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/dora".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def export_baseline_diff(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/baselines-diff/export (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/baselines-diff/export".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def field_type_names(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/field-types (rôles : athena-team-member, athena-admin)"""
        path = "/v1/field-types"
        return self._client.request("GET", path, query=query)
    def gitlab_integration(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/integrations/gitlab (rôles : athena-admin)"""
        path = "/v1/projects/{project}/integrations/gitlab".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query)
    def history_integration(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/integrations/history (rôles : athena-admin)"""
        path = "/v1/projects/{project}/integrations/history".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query)
    def import_data(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/import (rôles : athena-admin)"""
        path = "/v1/projects/{project}/import".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def index_docs(self, project, source, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/docs/{source}/index (rôles : athena-admin)"""
        path = "/v1/projects/{project}/docs/{source}/index".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{source}", urllib.parse.quote(str(source), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def install_plugin(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/plugins (rôles : athena-admin)"""
        path = "/v1/plugins"
        return self._client.request("POST", path, query=query, body=body)
    def list_baselines(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/baselines (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/baselines".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def list_plugins(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/plugins (rôles : athena-admin)"""
        path = "/v1/plugins"
        return self._client.request("GET", path, query=query)
    def list_rules(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/automations (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/automations".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def list_webhooks(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/webhooks (rôles : athena-admin)"""
        path = "/v1/webhooks"
        return self._client.request("GET", path, query=query)
    def list_widgets(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/widgets (rôles : athena-team-member, athena-admin)"""
        path = "/v1/widgets"
        return self._client.request("GET", path, query=query)
    def migrate_keys(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/history/migrate-keys (rôles : athena-admin)"""
        path = "/v1/projects/{project}/history/migrate-keys".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query)
    def plan_backports(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/backports (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/backports".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def plugin_action(self, id, name, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/plugins/{id}/actions/{name} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/plugins/{id}/actions/{name}".replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{name}", urllib.parse.quote(str(name), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def plugin_connector(self, project, id, name, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/plugins/{id}/connectors/{name} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/plugins/{id}/connectors/{name}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{name}", urllib.parse.quote(str(name), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def plugin_widget(self, id, name, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/plugins/{id}/widgets/{name} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/plugins/{id}/widgets/{name}".replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{name}", urllib.parse.quote(str(name), safe=""))
        return self._client.request("GET", path, query=query)
    def rebuild(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/rebuild (rôles : athena-admin)"""
        path = "/v1/projects/{project}/rebuild".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query)
    def receive_gitlab(self, org, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /hooks/in/gitlab/{org}/{project} (public)"""
        path = "/hooks/in/gitlab/{org}/{project}".replace("{org}", urllib.parse.quote(str(org), safe="")).replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def receive_history(self, org, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /hooks/in/history/{org}/{project} (public)"""
        path = "/hooks/in/history/{org}/{project}".replace("{org}", urllib.parse.quote(str(org), safe="")).replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def receive_inbound(self, org, project, name, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /hooks/in/source/{org}/{project}/{name} (public)"""
        path = "/hooks/in/source/{org}/{project}/{name}".replace("{org}", urllib.parse.quote(str(org), safe="")).replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{name}", urllib.parse.quote(str(name), safe=""))
        return self._client.request("POST", path, query=query)
    def release_notes(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/releases/{id}/notes (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/releases/{id}/notes".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def replay(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/webhooks/deliveries/{id}/replay (rôles : athena-admin)"""
        path = "/v1/webhooks/deliveries/{id}/replay".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query)
    def rule_runs(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/automations/{id}/runs (rôles : athena-admin, athena-pm)"""
        path = "/v1/automations/{id}/runs".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def sync_docs(self, project, source, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/docs/{source}/sync (rôles : athena-admin)"""
        path = "/v1/projects/{project}/docs/{source}/sync".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{source}", urllib.parse.quote(str(source), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def toggle_plugin(self, id, state, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/plugins/{id}/{state} (rôles : athena-admin)"""
        path = "/v1/plugins/{id}/{state}".replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{state}", urllib.parse.quote(str(state), safe=""))
        return self._client.request("POST", path, query=query)
    def toggle_rule(self, id, state, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/automations/{id}/{state} (rôles : athena-admin, athena-pm)"""
        path = "/v1/automations/{id}/{state}".replace("{id}", urllib.parse.quote(str(id), safe="")).replace("{state}", urllib.parse.quote(str(state), safe=""))
        return self._client.request("POST", path, query=query)
    def uninstall_plugin(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/plugins/{id} (rôles : athena-admin)"""
        path = "/v1/plugins/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def writeback_docs(self, project, source, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/docs/{source}/writeback (rôles : athena-admin)"""
        path = "/v1/projects/{project}/docs/{source}/writeback".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{source}", urllib.parse.quote(str(source), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _ItemApproval(_Group):
    def decide(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/artifacts/{key}/approval/decision (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/projects/{project}/artifacts/{key}/approval/decision".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def flow(self, project, tracker, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/trackers/{tracker}/approval-flow (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/trackers/{tracker}/approval-flow".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("GET", path, query=query)
    def set_flow(self, project, tracker, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/trackers/{tracker}/approval-flow (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/trackers/{tracker}/approval-flow".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def state(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/approval (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/artifacts/{key}/approval".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)


class _Lifecycle(_Group):
    def config(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/lifecycle (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/lifecycle"
        return self._client.request("GET", path, query=query)
    def for_project(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/lifecycle (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/lifecycle".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/lifecycle (rôles : athena-admin)"""
        path = "/v1/admin/lifecycle"
        return self._client.request("PUT", path, query=query, body=body)
    def reset(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/admin/lifecycle (rôles : athena-admin)"""
        path = "/v1/admin/lifecycle"
        return self._client.request("DELETE", path, query=query)
    def transition(self, p, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{p}/lifecycle/transition (rôles : athena-admin, athena-pmo, athena-pm)"""
        path = "/v1/projects/{p}/lifecycle/transition".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _LinkType(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/link-types (rôles : athena-admin)"""
        path = "/v1/link-types"
        return self._client.request("POST", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/link-types (rôles : athena-team-member, athena-admin)"""
        path = "/v1/link-types"
        return self._client.request("GET", path, query=query)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/link-types/{key} (rôles : athena-admin)"""
        path = "/v1/link-types/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/link-types/{key} (rôles : athena-admin)"""
        path = "/v1/link-types/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Matrix(_Group):
    def get(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/matrix (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/matrix".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)


class _Member(_Group):
    def list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/members (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/members".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, project, subject, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/members/{subject} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/members/{subject}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("DELETE", path, query=query)
    def set(self, project, subject, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/members/{subject} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/members/{subject}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def users(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/users (rôles : athena-admin, athena-pmo, athena-pm)"""
        path = "/v1/users"
        return self._client.request("GET", path, query=query)


class _Metrics(_Group):
    def scrape(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /metrics (public)"""
        path = "/metrics"
        return self._client.request("GET", path, query=query)


class _Normative(_Group):
    def clear_tailoring(self, project, category, clause, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/tailoring/{category}/{clause} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/tailoring/{category}/{clause}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{category}", urllib.parse.quote(str(category), safe="")).replace("{clause}", urllib.parse.quote(str(clause), safe=""))
        return self._client.request("DELETE", path, query=query)
    def conformity(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/conformity (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/conformity".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def conformity_export(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/conformity/export (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/conformity/export".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def import_clauses(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/clauses/import (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/clauses/import".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def set_tailoring(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/tailoring (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/tailoring".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def tailoring(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/tailoring (rôles : athena-team-member, athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/tailoring".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)


class _Notify(_Group):
    def digest_settings(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/notification-digest (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notification-digest"
        return self._client.request("GET", path, query=query)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/notifications (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notifications"
        return self._client.request("GET", path, query=query)
    def mentionable(self, project, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/artifacts/{key}/mentionable (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/artifacts/{key}/mentionable".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def prefs(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/notification-prefs (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notification-prefs"
        return self._client.request("GET", path, query=query)
    def read(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/me/notifications/read (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notifications/read"
        return self._client.request("POST", path, query=query, body=body)
    def set_digest(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/notification-digest (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notification-digest"
        return self._client.request("PUT", path, query=query, body=body)
    def set_pref(self, event, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/notification-prefs/{event} (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/notification-prefs/{event}".replace("{event}", urllib.parse.quote(str(event), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def stream(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/events (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/me/events"
        return self._client.request("GET", path, query=query)
    def subscribe(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/subscriptions (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/projects/{project}/subscriptions".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def subscriptions(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/subscriptions (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/projects/{project}/subscriptions".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def unsubscribe(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/subscriptions/{id} (rôles : athena-team-member, athena-admin, athena-qa)"""
        path = "/v1/subscriptions/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)


class _OpenApi(_Group):
    def spec(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/openapi.json (rôles : athena-team-member, athena-admin)"""
        path = "/v1/openapi.json"
        return self._client.request("GET", path, query=query)


class _Pat(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/me/tokens (rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance)"""
        path = "/v1/me/tokens"
        return self._client.request("POST", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/tokens (rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance)"""
        path = "/v1/me/tokens"
        return self._client.request("GET", path, query=query)
    def revoke(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/me/tokens/{id} (rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance)"""
        path = "/v1/me/tokens/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)


class _Pin(_Group):
    def favorite(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/pins/favorite (rôles : athena-team-member, athena-admin)"""
        path = "/v1/me/pins/favorite"
        return self._client.request("PUT", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/pins (rôles : athena-team-member, athena-admin)"""
        path = "/v1/me/pins"
        return self._client.request("GET", path, query=query)
    def order(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/pins/order (rôles : athena-team-member, athena-admin)"""
        path = "/v1/me/pins/order"
        return self._client.request("PUT", path, query=query, body=body)
    def visit(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/me/pins/visit (rôles : athena-team-member, athena-admin)"""
        path = "/v1/me/pins/visit"
        return self._client.request("POST", path, query=query, body=body)


class _Planning(_Group):
    def apply(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/schedule/apply (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/schedule/apply".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query)
    def baselines(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/schedule/baselines (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/schedule/baselines".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def edit_task(self, project, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/schedule/tasks/{key} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/schedule/tasks/{key}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def get(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/schedule (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/schedule".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def set_lag(self, project, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/schedule/links/{id} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/schedule/links/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)


class _Portfolio(_Group):
    def actions(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/actions (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/actions".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def alerts(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/alerts (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/alerts".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios"
        return self._client.request("POST", path, query=query, body=body)
    def decision_apply(self, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/decisions/{id}/apply (rôles : athena-admin, athena-finance)"""
        path = "/v1/portfolios/{key}/decisions/{id}/apply".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("POST", path, query=query)
    def decision_create(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/decisions (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/decisions".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def decision_list(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/decisions (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/decisions".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def gates(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/gates (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/gates".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def get(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key} (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def health(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/health (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/health".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios"
        return self._client.request("GET", path, query=query)
    def milestone_trend(self, key, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/milestone-trend/{project} (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/milestone-trend/{project}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/portfolios/{key} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def remove_project(self, key, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/portfolios/{key}/projects/{project} (rôles : athena-admin, athena-pmo, athena-pm)"""
        path = "/v1/portfolios/{key}/projects/{project}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("DELETE", path, query=query)
    def retention(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/portfolios/{key}/snapshot-retention (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/snapshot-retention".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def review_create(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/reviews (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/reviews".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def review_get(self, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/reviews/{id} (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/reviews/{id}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def review_list(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/reviews (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/reviews".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def review_patch(self, key, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/portfolios/{key}/reviews/{id} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/reviews/{id}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def risks(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/risks (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/risks".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def roadmap(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/roadmap (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/roadmap".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def set_project(self, key, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/portfolios/{key}/projects/{project} (rôles : athena-admin, athena-pmo, athena-pm)"""
        path = "/v1/portfolios/{key}/projects/{project}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def snapshot_compare(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/snapshots/compare (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/snapshots/compare".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def snapshot_get(self, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/snapshots/{id} (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/snapshots/{id}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def snapshot_list(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/snapshots (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/snapshots".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def snapshot_take(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/snapshots (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/snapshots".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def summaries(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/summary (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/summary"
        return self._client.request("GET", path, query=query)
    def trend(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/trend (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/trend".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/portfolios/{key} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)
    def usage_report(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/usage (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/usage"
        return self._client.request("GET", path, query=query)


class _PpmSettings(_Group):
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/ppm-settings (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/ppm-settings"
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/admin/ppm-settings (rôles : athena-admin)"""
        path = "/v1/admin/ppm-settings"
        return self._client.request("PUT", path, query=query, body=body)


class _Preference(_Group):
    def get(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/preferences (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/preferences"
        return self._client.request("GET", path, query=query)
    def put(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/me/preferences (rôles : athena-team-member, athena-admin, athena-pm, athena-qa)"""
        path = "/v1/me/preferences"
        return self._client.request("PUT", path, query=query, body=body)


class _Prioritization(_Group):
    def convert(self, ticket, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/requests/{ticket}/convert (rôles : athena-admin, athena-pmo)"""
        path = "/v1/requests/{ticket}/convert".replace("{ticket}", urllib.parse.quote(str(ticket), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def earned_value(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/earned-value (rôles : athena-admin, athena-finance, athena-pmo, athena-director)"""
        path = "/v1/portfolios/{key}/earned-value".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def model(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/scoring-model (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/scoring-model".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def objective(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/objectives (rôles : athena-admin, athena-pmo)"""
        path = "/v1/objectives"
        return self._client.request("POST", path, query=query, body=body)
    def objective_flow(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/objectives (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/objectives".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def objective_link(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/objectives/{key}/projects (rôles : athena-admin, athena-pmo)"""
        path = "/v1/objectives/{key}/projects".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def ranking(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/ranking (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/ranking".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def refuse(self, ticket, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/requests/{ticket}/refuse (rôles : athena-admin, athena-pmo)"""
        path = "/v1/requests/{ticket}/refuse".replace("{ticket}", urllib.parse.quote(str(ticket), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def scenario_create(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/scenarios (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/scenarios".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def scenario_evaluate(self, key, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/scenarios/{id}/evaluate (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/scenarios/{id}/evaluate".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("GET", path, query=query)
    def scenario_list(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/portfolios/{key}/scenarios (rôles : athena-admin, athena-pmo, athena-pm, athena-director)"""
        path = "/v1/portfolios/{key}/scenarios".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def score(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/portfolios/{key}/scores (rôles : athena-admin, athena-pmo)"""
        path = "/v1/portfolios/{key}/scores".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _Privacy(_Group):
    def erase(self, subject, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/admin/users/{subject}/erase (rôles : athena-admin)"""
        path = "/v1/admin/users/{subject}/erase".replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def export_mine(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/me/data-export (rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance)"""
        path = "/v1/me/data-export"
        return self._client.request("GET", path, query=query)
    def export_of(self, subject, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/admin/users/{subject}/data-export (rôles : athena-admin)"""
        path = "/v1/admin/users/{subject}/data-export".replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("GET", path, query=query)


class _ProjectMeta(_Group):
    def get(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/meta (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/meta".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def patch(self, p, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{p}/meta (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{p}/meta".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)


class _ProjectOverview(_Group):
    def activity(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/activity (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/activity".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def modules(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/modules (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/modules".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def overview_of(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/overview (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/overview".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)


class _ProjectTemplate(_Group):
    def advance(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/template/phase/advance (rôles : athena-admin, athena-pm, athena-qa)"""
        path = "/v1/projects/{project}/template/phase/advance".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def check_criterion(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/template/phase/criteria (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/template/phase/criteria".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def phase_dates(self, project, phase, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/projects/{project}/template/phases/{phase} (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{project}/template/phases/{phase}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{phase}", urllib.parse.quote(str(phase), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def preview(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/template/upgrade-preview (rôles : athena-admin)"""
        path = "/v1/projects/{project}/template/upgrade-preview".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def status(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/template (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/template".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def upgrade(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/template/upgrade (rôles : athena-admin)"""
        path = "/v1/projects/{project}/template/upgrade".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _SavedFilter(_Group):
    def create(self, project, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{project}/filters (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/filters".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def list(self, project, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/filters (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/filters".replace("{project}", urllib.parse.quote(str(project), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, project, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{project}/filters/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/filters/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def set_default(self, project, id, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/projects/{project}/filters/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/filters/{id}".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)


class _Search(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/searches (rôles : athena-team-member, athena-admin)"""
        path = "/v1/searches"
        return self._client.request("POST", path, query=query, body=body)
    def facets(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/search/facets (rôles : athena-team-member, athena-admin)"""
        path = "/v1/search/facets"
        return self._client.request("GET", path, query=query)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/searches (rôles : athena-team-member, athena-admin)"""
        path = "/v1/searches"
        return self._client.request("GET", path, query=query)
    def remove(self, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/searches/{id} (rôles : athena-team-member, athena-admin)"""
        path = "/v1/searches/{id}".replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)
    def search(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/search (rôles : athena-team-member, athena-admin)"""
        path = "/v1/search"
        return self._client.request("GET", path, query=query)


class _StatusNote(_Group):
    def list(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/status-notes (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/status-notes".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def write(self, p, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{p}/status-notes (rôles : athena-admin, athena-pm)"""
        path = "/v1/projects/{p}/status-notes".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("POST", path, query=query, body=body)


class _Team(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/teams (rôles : athena-admin, athena-pmo)"""
        path = "/v1/teams"
        return self._client.request("POST", path, query=query, body=body)
    def get(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/teams/{key} (rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director)"""
        path = "/v1/teams/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/teams (rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director)"""
        path = "/v1/teams"
        return self._client.request("GET", path, query=query)
    def load(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/teams/{key}/load (rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director)"""
        path = "/v1/teams/{key}/load".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/teams/{key} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/teams/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def remove_member(self, key, subject, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/teams/{key}/members/{subject} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/teams/{key}/members/{subject}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("DELETE", path, query=query)
    def set_member(self, key, subject, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/teams/{key}/members/{subject} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/teams/{key}/members/{subject}".replace("{key}", urllib.parse.quote(str(key), safe="")).replace("{subject}", urllib.parse.quote(str(subject), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PATCH /v1/teams/{key} (rôles : athena-admin, athena-pmo)"""
        path = "/v1/teams/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PATCH", path, query=query, body=body)


class _Template(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/project-templates (rôles : athena-admin)"""
        path = "/v1/project-templates"
        return self._client.request("POST", path, query=query, body=body)
    def export_yaml(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/project-templates/{key}/export (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}/export".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def import_yaml(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/project-templates/import (rôles : athena-admin)"""
        path = "/v1/project-templates/import"
        return self._client.request("POST", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/project-templates (rôles : athena-admin)"""
        path = "/v1/project-templates"
        return self._client.request("GET", path, query=query)
    def publish(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/project-templates/{key}/publish (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}/publish".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/project-templates/{key} (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def resolved(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/project-templates/{key}/resolved (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}/resolved".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/project-templates/{key} (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)
    def versions(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/project-templates/{key}/versions (rôles : athena-admin)"""
        path = "/v1/project-templates/{key}/versions".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)


class _TrackerTemplate(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/tracker-templates (rôles : athena-admin)"""
        path = "/v1/tracker-templates"
        return self._client.request("POST", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/tracker-templates (rôles : athena-admin, athena-pm)"""
        path = "/v1/tracker-templates"
        return self._client.request("GET", path, query=query)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/tracker-templates/{key} (rôles : athena-admin)"""
        path = "/v1/tracker-templates/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/tracker-templates/{key} (rôles : athena-admin)"""
        path = "/v1/tracker-templates/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _TrackerType(_Group):
    def create(self, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/tracker-types (rôles : athena-admin)"""
        path = "/v1/tracker-types"
        return self._client.request("POST", path, query=query, body=body)
    def list(self, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/tracker-types (rôles : athena-team-member, athena-admin)"""
        path = "/v1/tracker-types"
        return self._client.request("GET", path, query=query)
    def remove(self, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/tracker-types/{key} (rôles : athena-admin)"""
        path = "/v1/tracker-types/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("DELETE", path, query=query)
    def update(self, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """PUT /v1/tracker-types/{key} (rôles : athena-admin)"""
        path = "/v1/tracker-types/{key}".replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("PUT", path, query=query, body=body)


class _Tree(_Group):
    def children(self, project, tracker, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{project}/trackers/{tracker}/tree (rôles : athena-team-member, athena-admin)"""
        path = "/v1/projects/{project}/trackers/{tracker}/tree".replace("{project}", urllib.parse.quote(str(project), safe="")).replace("{tracker}", urllib.parse.quote(str(tracker), safe=""))
        return self._client.request("GET", path, query=query)


class _Worklog(_Group):
    def add(self, p, key, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        """POST /v1/projects/{p}/artifacts/{key}/worklog (rôles : athena-team-member, athena-admin, athena-pm, athena-manager)"""
        path = "/v1/projects/{p}/artifacts/{key}/worklog".replace("{p}", urllib.parse.quote(str(p), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("POST", path, query=query, body=body)
    def for_ticket(self, p, key, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/artifacts/{key}/worklog (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/artifacts/{key}/worklog".replace("{p}", urllib.parse.quote(str(p), safe="")).replace("{key}", urllib.parse.quote(str(key), safe=""))
        return self._client.request("GET", path, query=query)
    def planned_vs_consumed(self, p, query: Optional[Dict[str, Any]] = None) -> Any:
        """GET /v1/projects/{p}/planned-vs-consumed (rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director)"""
        path = "/v1/projects/{p}/planned-vs-consumed".replace("{p}", urllib.parse.quote(str(p), safe=""))
        return self._client.request("GET", path, query=query)
    def remove(self, p, id, query: Optional[Dict[str, Any]] = None) -> Any:
        """DELETE /v1/projects/{p}/worklog/{id} (rôles : athena-team-member, athena-admin, athena-pm, athena-manager)"""
        path = "/v1/projects/{p}/worklog/{id}".replace("{p}", urllib.parse.quote(str(p), safe="")).replace("{id}", urllib.parse.quote(str(id), safe=""))
        return self._client.request("DELETE", path, query=query)


class AthenaClient:
    def __init__(self, base_url: str, token: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.access = _Access(self)
        self.agile = _Agile(self)
        self.allocation = _Allocation(self)
        self.appearance = _Appearance(self)
        self.approval = _Approval(self)
        self.attachment = _Attachment(self)
        self.bff = _Bff(self)
        self.brand = _Brand(self)
        self.calendar = _Calendar(self)
        self.capacity = _Capacity(self)
        self.core = _Core(self)
        self.coverage = _Coverage(self)
        self.dashboard = _Dashboard(self)
        self.dependency = _Dependency(self)
        self.doc = _Doc(self)
        self.feature = _Feature(self)
        self.finance = _Finance(self)
        self.graphql = _Graphql(self)
        self.health = _Health(self)
        self.integrations = _Integrations(self)
        self.item_approval = _ItemApproval(self)
        self.lifecycle = _Lifecycle(self)
        self.link_type = _LinkType(self)
        self.matrix = _Matrix(self)
        self.member = _Member(self)
        self.metrics = _Metrics(self)
        self.normative = _Normative(self)
        self.notify = _Notify(self)
        self.open_api = _OpenApi(self)
        self.pat = _Pat(self)
        self.pin = _Pin(self)
        self.planning = _Planning(self)
        self.portfolio = _Portfolio(self)
        self.ppm_settings = _PpmSettings(self)
        self.preference = _Preference(self)
        self.prioritization = _Prioritization(self)
        self.privacy = _Privacy(self)
        self.project_meta = _ProjectMeta(self)
        self.project_overview = _ProjectOverview(self)
        self.project_template = _ProjectTemplate(self)
        self.saved_filter = _SavedFilter(self)
        self.search = _Search(self)
        self.status_note = _StatusNote(self)
        self.team = _Team(self)
        self.template = _Template(self)
        self.tracker_template = _TrackerTemplate(self)
        self.tracker_type = _TrackerType(self)
        self.tree = _Tree(self)
        self.worklog = _Worklog(self)

    def request(self, method: str, path: str, query: Optional[Dict[str, Any]] = None, body: Any = None) -> Any:
        url = self.base_url + path
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Authorization": "Bearer " + self.token}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            try:
                raise AthenaError(error.code, json.loads(raw)) from None
            except ValueError:
                raise AthenaError(error.code, raw) from None
        if not text:
            return None
        try:
            return json.loads(text)
        except ValueError:
            return text
