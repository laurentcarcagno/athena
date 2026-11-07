{{- define "athena.image" -}}
{{- $reg := .root.Values.image.registry -}}
{{- $tag := default .root.Chart.AppVersion .spec.tag -}}
{{- if $reg }}{{ $reg }}/{{ .spec.repository }}:{{ $tag }}{{ else }}{{ .spec.repository }}:{{ $tag }}{{ end -}}
{{- end -}}

{{- define "athena.labels" -}}
app.kubernetes.io/name: athena
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "athena.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  seccompProfile: { type: RuntimeDefault }
{{- end -}}

{{- define "athena.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: ["ALL"] }
{{- end -}}

{{- define "athena.env" -}}
- { name: NODE_ENV, value: production }
- { name: HOST, value: "0.0.0.0" }
- { name: KEYCLOAK_ISSUER, value: {{ .Values.config.keycloakIssuer | quote }} }
- { name: KEYCLOAK_WEB_CLIENT_ID, value: {{ .Values.config.keycloakWebClientId | quote }} }
- { name: PUBLIC_URL, value: {{ .Values.publicUrl | quote }} }
- { name: WEB_ORIGIN, value: {{ .Values.publicUrl | quote }} }
- { name: CORS_ORIGIN, value: {{ default .Values.publicUrl .Values.config.corsOrigin | quote }} }
- { name: COOKIE_SECURE, value: "true" }
- { name: TRUST_PROXY, value: {{ .Values.config.trustProxy | quote }} }
- { name: WEBHOOK_ALLOW_PRIVATE, value: {{ .Values.config.webhookAllowPrivate | quote }} }
- { name: RATE_LIMIT_API_PER_MINUTE, value: {{ .Values.config.rateLimitApiPerMinute | quote }} }
- { name: RATE_LIMIT_SENSITIVE_PER_MINUTE, value: {{ .Values.config.rateLimitSensitivePerMinute | quote }} }
{{- with .Values.protectionLevel }}
- { name: ATHENA_PROTECTION_LEVEL, value: {{ . | quote }} }
{{- end }}
{{- with .Values.config.openbaoAddr }}
- { name: OPENBAO_ADDR, value: {{ . | quote }} }
{{- end }}
{{- with .Values.config.gitlabUrl }}
- { name: GITLAB_URL, value: {{ . | quote }} }
{{- end }}
{{- with .Values.config.gitlabNamespace }}
- { name: GITLAB_NAMESPACE, value: {{ . | quote }} }
{{- end }}
{{- if and .Values.config.smtp.enabled .Values.config.smtp.host .Values.config.smtp.from }}
- { name: SMTP_HOST, value: {{ .Values.config.smtp.host | quote }} }
- { name: SMTP_PORT, value: {{ .Values.config.smtp.port | quote }} }
- { name: SMTP_SECURITY, value: {{ .Values.config.smtp.security | quote }} }
- { name: SMTP_FROM, value: {{ .Values.config.smtp.from | quote }} }
{{- else }}
- { name: DIGEST_ENABLED, value: "false" }
{{- end }}
{{- end -}}
