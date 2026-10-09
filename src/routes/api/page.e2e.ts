// fallow-ignore-file unused-file -- Playwright discovers this route test by filename.
import { expect, test } from '@playwright/test';

test('the API reference lets a developer find an endpoint and copy its example', async ({
	page,
	request
}) => {
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('http://localhost:4173/api');
	await expect(page.getByRole('heading', { name: 'API de génération' })).toBeVisible();
	const authentication = page.locator('section').filter({
		has: page.getByRole('heading', { name: 'Authentification' })
	});
	await expect(
		authentication.getByRole('link', {
			name: "Écrire à l'équipe Genlexis pour obtenir votre clé API"
		})
	).toHaveAttribute('href', 'mailto:benoitdelemps@protonmail.com?subject=Genlexis%20API');
	await expect(authentication.locator('code')).toHaveText('glx_0123456789...abcdef');
	await expect(
		authentication.getByText("Une clé API est requise. Elle est attribuée par l'équipe Genlexis.")
	).toBeVisible();
	await expect(authentication.getByText('scripts et applications serveur')).toHaveCount(0);
	await expect(page.getByText('/v1/draws')).toHaveCount(0);
	await expect(page.getByText('/v1/pools/{protocolRevision}')).toHaveCount(0);
	await expect(page.getByRole('searchbox')).toHaveCount(0);
	await expect(
		page.getByRole('heading', { name: 'Générer des listes de phrases françaises acceptées' })
	).toBeVisible();
	await page.getByRole('link', { name: /\/v1\/generations/ }).click();
	await expect(page.getByText('selection', { exact: true }).first()).toBeVisible();
	await page.getByText('Voir les 6 champs').click();
	await expect(page.getByText('detType', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Équilibrage phonémique' }).click();
	await page.getByRole('button', { name: 'Copier Requête cURL' }).click();
	await expect(page.getByRole('button', { name: 'Copié Requête cURL' })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		'"selection": "phoneme_balanced"'
	);
	const spec = await request.get('http://localhost:4173/api/openapi.yaml');
	expect(spec.ok()).toBe(true);
	expect(await spec.text()).toContain('/v1/generations:');
});

test('the API reference remains readable on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://localhost:4173/api');
	await expect(page.getByRole('link', { name: /\/v1\/generations/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Générer des listes de phrases/ })).toBeVisible();
	await expect(page.getByText('Requête cURL')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('the English route uses English documentation labels', async ({ page }) => {
	await page
		.context()
		.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'en', url: 'http://localhost:4173' }]);
	await page.goto('http://localhost:4173/api');
	await expect(
		page.getByRole('heading', { name: 'Generate accepted French sentence lists' })
	).toBeVisible();
	await expect(page.getByText('A seed reproduces the result only')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Phoneme balanced' })).toBeVisible();
});
