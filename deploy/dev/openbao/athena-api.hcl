# Politique du service athena-api (moindre privilège, développement).
path "secret/data/athena/*"     { capabilities = ["create","read","update","delete","list"] }
path "secret/metadata/athena/*" { capabilities = ["read","list","delete"] }
path "transit/encrypt/athena-*" { capabilities = ["update"] }
path "transit/decrypt/athena-*" { capabilities = ["update"] }
path "transit/rewrap/athena-*"  { capabilities = ["update"] }
path "transit/keys/athena-*"    { capabilities = ["create","read","update"] }
