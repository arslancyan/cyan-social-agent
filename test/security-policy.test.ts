import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {limits,hasWorkspaceRole,normalizeEmail,isValidEmail,isValidPassword,isReasonableId} from "../lib/security-policy";

describe("security policy",()=>{
 it("keeps plan quotas stable",()=>{
  assert.deepEqual(limits("free"),{generations:10,publishes:10,accounts:1});
  assert.deepEqual(limits("pro"),{generations:600,publishes:500,accounts:10});
  assert.deepEqual(limits("agency"),{generations:3000,publishes:3000,accounts:50});
 });
 it("uses hierarchical workspace permissions",()=>{
  assert.equal(hasWorkspaceRole("owner",["editor"]),true);
  assert.equal(hasWorkspaceRole("admin",["editor"]),true);
  assert.equal(hasWorkspaceRole("editor",["admin"]),false);
  assert.equal(hasWorkspaceRole("viewer",["editor"]),false);
  assert.equal(hasWorkspaceRole(null,["viewer"]),false);
 });
 it("normalizes and validates credentials",()=>{
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(isValidEmail("user@example.com"),true);
  assert.equal(isValidEmail("not-an-email"),false);
  assert.equal(isValidEmail("a".repeat(321)+"@x.com"),false);
  assert.equal(isValidPassword("12345678"),true);
  assert.equal(isValidPassword("short"),false);
  assert.equal(isValidPassword("x".repeat(257)),false);
 });
 it("rejects empty or oversized identifiers",()=>{
  assert.equal(isReasonableId("draft-1"),true);
  assert.equal(isReasonableId(""),false);
  assert.equal(isReasonableId("x".repeat(201)),false);
 });
});
