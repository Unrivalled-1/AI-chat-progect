// settings.js

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('model-form');
    const availableList = document.getElementById('available-model-list');
    const enabledList = document.getElementById('enabled-model-list');

    function modelCard(model, showInEnabledList = false) {
        const card = document.createElement('div');
        card.className = 'chip';

        const title = document.createElement('div');
        title.className = 'chip-title';
        title.textContent = model.name;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'chip-meta';
        meta.textContent = `${model.id} • ${model.provider || 'huggingface'}${model.builtin ? ' • built-in' : ' • custom'}`;
        card.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'actions';

        if (!showInEnabledList) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle';
            toggleBtn.textContent = model.enabled ? 'Hide from dropdown' : 'Show in dropdown';
            toggleBtn.onclick = () => setModelEnabled(model.id, !model.enabled);
            actions.appendChild(toggleBtn);
        }

        if (!model.builtin) {
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.className = 'remove';
            removeBtn.onclick = () => removeModel(model.id);
            actions.appendChild(removeBtn);
        }

        if (actions.children.length > 0) card.appendChild(actions);
        return card;
    }

    function fetchModels() {
        fetch('/api/models')
            .then(res => res.json())
            .then(models => {
                availableList.innerHTML = '';
                enabledList.innerHTML = '';
                models.forEach(model => {
                    availableList.appendChild(modelCard(model, false));
                    if (model.enabled) {
                        enabledList.appendChild(modelCard(model, true));
                    }
                });
                if (!enabledList.children.length) {
                    const empty = document.createElement('div');
                    empty.className = 'muted';
                    empty.textContent = 'No models are currently visible in the dropdown.';
                    enabledList.appendChild(empty);
                }
            });
    }

    function setModelEnabled(modelId, enabled) {
        fetch(`/api/models/${encodeURIComponent(modelId)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        }).then(fetchModels);
    }

    function removeModel(modelId) {
        fetch(`/api/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' })
            .then(fetchModels);
    }

    form.onsubmit = function(e) {
        e.preventDefault();
        const data = {
            id: form['model-id'].value,
            name: form['model-name'].value,
            provider: form['model-provider'].value,
            credit_multiplier: Number(form['model-credit'].value || 1.0)
        };
        fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(async (res) => {
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                alert(payload.error || 'Failed to add model');
                return;
            }
            form.reset();
            fetchModels();
        });
    };

    fetchModels();
});
