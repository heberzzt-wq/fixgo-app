from pathlib import Path

path = Path('tools/v94_generalist_followup_patch.py')
text = path.read_text(encoding='utf-8')
old = '''                        "If the user asks for WhatsApp but did not provide a number, use whatsapp empty and whatsappRequested=true; never invent a number.",'''
new = '''                        "Si el usuario pide WhatsApp pero no dio número, usa whatsapp vacío y whatsappRequested=true; nunca inventes un número.",'''
count = text.count(old)
if count != 2:
    raise SystemExit(f'FOLLOWUP_ANCHOR_FIX_FAILED:{count}')
text = text.replace(old, new)
old2 = '''                        "If the user provided no contact channel at all, leave whatsapp and contactEmail empty; page content is still valid without contact data.",'''
new2 = '''                        "Si el usuario no proporcionó ningún canal de contacto, deja whatsapp y contactEmail vacíos; el contenido de la página sigue siendo válido sin datos de contacto.",'''
count2 = text.count(old2)
if count2 != 1:
    raise SystemExit(f'FOLLOWUP_NEW_PROMPT_FIX_FAILED:{count2}')
text = text.replace(old2, new2, 1)
path.write_text(text, encoding='utf-8')
print('V94_FOLLOWUP_PATCH_ANCHOR_FIXED')
