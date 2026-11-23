/*
 *  Copyright 2026 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.jdbi3;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.openmetadata.service.jdbi3.TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.SYSTEM_PROFILE_EXTENSION;
import static org.openmetadata.service.jdbi3.TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.TABLE_COLUMN_PROFILE_EXTENSION;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.openmetadata.schema.api.data.CreateEntityProfile;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.ColumnProfile;
import org.openmetadata.schema.type.DmlOperationType;
import org.openmetadata.schema.type.EntityProfile;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.SystemProfile;
import org.openmetadata.schema.type.TableProfile;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.BadRequestException;

/**
 * The profiler write path converts the posted {@code profileData} dict to its typed form. The
 * strict conversion must accept conformant payloads (stored against the column FQN) and fail
 * malformed ones with a clear 400 — never a 500 {@code ClassCastException} (C-7 live: every
 * column post 500'd because the sink sent {@code executionSource}).
 */
class EntityProfileRepositoryTest {
  private static final String TABLE_FQN = "svc.db.sch.orders";
  private static final String COLUMN_FQN = TABLE_FQN + ".email";
  private static final long TIMESTAMP = 1_700_000_000_000L;

  private CollectionDAO collectionDAO;
  private TimeSeriesDAOs.ProfilerDataTimeSeriesDAO profiles;
  private EntityProfileRepository repository;

  @BeforeEach
  void setUp() {
    collectionDAO = mock(CollectionDAO.class);
    profiles = mock(TimeSeriesDAOs.ProfilerDataTimeSeriesDAO.class);
    when(collectionDAO.profilerDataTimeSeriesDao()).thenReturn(profiles);
    Entity.setCollectionDAO(collectionDAO);
    Entity.setSearchRepository(null);
    repository = new EntityProfileRepository();
  }

  @AfterEach
  void tearDown() {
    Entity.setCollectionDAO(null);
    Entity.setSearchRepository(null);
  }

  @Test
  void conformantColumnProfileIsStoredAgainstColumnFqn() {
    Response response =
        repository.addProfileData(uriInfo(), table(), columnCreate(conformantColumnData()));

    assertEquals(Response.Status.CREATED.getStatusCode(), response.getStatus());
    ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
    verify(profiles)
        .insert(
            eq(COLUMN_FQN),
            eq(TABLE_COLUMN_PROFILE_EXTENSION),
            eq("columnProfile"),
            json.capture());
    EntityProfile stored = JsonUtils.readValue(json.getValue(), EntityProfile.class);
    assertInstanceOf(Map.class, stored.getProfileData());
    assertEquals("email", ((Map<?, ?>) stored.getProfileData()).get("name"));
  }

  @Test
  void malformedColumnProfileFails400AndIsNotStored() {
    // The exact live shape: the old sink posted executionSource on every column.
    Map<String, Object> data = malformedColumnData();

    BadRequestException thrown =
        assertThrows(
            BadRequestException.class,
            () -> repository.addProfileData(uriInfo(), table(), columnCreate(data)));

    assertTrue(thrown.getMessage().contains("executionSource"));
    verify(profiles, never()).insert(anyString(), anyString(), anyString(), anyString());
  }

  @Test
  void conformantSystemProfileIsStored() {
    CreateEntityProfile create =
        new CreateEntityProfile()
            .withEntityType("table")
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.SYSTEM)
            .withTimestamp(TIMESTAMP)
            .withProfileData(
                Map.of("timestamp", TIMESTAMP, "operation", "INSERT", "rowsAffected", 10));

    Response response = repository.addProfileData(uriInfo(), table(), create);

    assertEquals(Response.Status.CREATED.getStatusCode(), response.getStatus());
    verify(profiles)
        .storeTimeSeriesWithOperation(
            eq(TABLE_FQN),
            eq(SYSTEM_PROFILE_EXTENSION),
            eq("systemProfile"),
            anyString(),
            eq(TIMESTAMP),
            eq("INSERT"),
            eq(false));
  }

  @Test
  void malformedSystemProfileFails400AndIsNotStored() {
    // systemProfile has no "additionalProperties": false in pin's table.json
    // (unlike columnProfile), so an unknown key is accepted by design and
    // cannot be the malformed shape — use an illegal enum value instead.
    Map<String, Object> data =
        Map.of("timestamp", TIMESTAMP, "operation", "BOGUS", "rowsAffected", 10);
    CreateEntityProfile create =
        new CreateEntityProfile()
            .withEntityType("table")
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.SYSTEM)
            .withTimestamp(TIMESTAMP)
            .withProfileData(data);

    assertThrows(
        BadRequestException.class, () -> repository.addProfileData(uriInfo(), table(), create));

    verify(profiles, never())
        .storeTimeSeriesWithOperation(
            anyString(),
            anyString(),
            anyString(),
            anyString(),
            anyLong(),
            anyString(),
            anyBoolean());
  }

  @Test
  void converterConvertsConformantColumnMap() {
    EntityProfile converted =
        EntityProfileRepository.deserializeProfileDataOrThrow(
            new EntityProfile()
                .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
                .withProfileData(conformantColumnData()));

    assertInstanceOf(ColumnProfile.class, converted.getProfileData());
    assertEquals("email", ((ColumnProfile) converted.getProfileData()).getName());
    assertEquals(3, ((ColumnProfile) converted.getProfileData()).getNullCount());
  }

  @Test
  void converterPassesThroughTypedColumnProfile() {
    ColumnProfile profile = new ColumnProfile().withName("email").withTimestamp(TIMESTAMP);
    EntityProfile entity =
        new EntityProfile()
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
            .withProfileData(profile);

    assertSame(
        profile, EntityProfileRepository.deserializeProfileDataOrThrow(entity).getProfileData());
  }

  @Test
  void converterRejectsUnknownKey() {
    EntityProfile entity =
        new EntityProfile()
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
            .withProfileData(malformedColumnData());

    BadRequestException thrown =
        assertThrows(
            BadRequestException.class,
            () -> EntityProfileRepository.deserializeProfileDataOrThrow(entity));

    assertTrue(thrown.getMessage().contains("ColumnProfile"));
    assertTrue(thrown.getMessage().contains("executionSource"));
  }

  @Test
  void converterRejectsWrongTypedProfileData() {
    EntityProfile entity =
        new EntityProfile()
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
            .withProfileData("not an object");

    assertThrows(
        BadRequestException.class,
        () -> EntityProfileRepository.deserializeProfileDataOrThrow(entity));
  }

  @Test
  void converterRejectsMissingProfileDataAndType() {
    EntityProfile noData =
        new EntityProfile().withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN);
    assertThrows(
        BadRequestException.class,
        () -> EntityProfileRepository.deserializeProfileDataOrThrow(noData));

    EntityProfile noType = new EntityProfile().withProfileData(conformantColumnData());
    assertThrows(
        BadRequestException.class,
        () -> EntityProfileRepository.deserializeProfileDataOrThrow(noType));
  }

  @Test
  void converterConvertsConformantSystemAndTableMaps() {
    EntityProfile system =
        EntityProfileRepository.deserializeProfileDataOrThrow(
            new EntityProfile()
                .withProfileType(CreateEntityProfile.ProfileTypeEnum.SYSTEM)
                .withProfileData(
                    Map.of("timestamp", TIMESTAMP, "operation", "INSERT", "rowsAffected", 10)));
    assertInstanceOf(SystemProfile.class, system.getProfileData());
    assertEquals(DmlOperationType.INSERT, ((SystemProfile) system.getProfileData()).getOperation());

    EntityProfile table =
        EntityProfileRepository.deserializeProfileDataOrThrow(
            new EntityProfile()
                .withProfileType(CreateEntityProfile.ProfileTypeEnum.TABLE)
                .withProfileData(Map.of("timestamp", TIMESTAMP, "rowCount", 5)));
    assertInstanceOf(TableProfile.class, table.getProfileData());
    assertEquals(5, ((TableProfile) table.getProfileData()).getRowCount());
  }

  @Test
  void listWithConformantStoredColumnProfileReturnsConvertedProfile() {
    when(profiles.listEntityProfileData(any(), any(), any()))
        .thenReturn(List.of(storedColumnProfile(conformantColumnData())));

    List<EntityProfile> listed =
        repository.listProfileData(new ListFilter(null), 0L, TIMESTAMP + 1, true).getData();

    assertEquals(1, listed.size());
    assertInstanceOf(ColumnProfile.class, listed.get(0).getProfileData());
    assertEquals("email", ((ColumnProfile) listed.get(0).getProfileData()).getName());
  }

  @Test
  void listWithMalformedStoredColumnProfileAndNoPiiFails400Not500() {
    when(profiles.listEntityProfileData(any(), any(), any()))
        .thenReturn(List.of(storedColumnProfile(malformedColumnData())));

    // The mask path converts authoritatively: a stored payload the lenient
    // pass could not convert must surface as a clear 400, not a 500
    // ClassCastException from the blind cast the old code did here.
    assertThrows(
        BadRequestException.class,
        () -> repository.listProfileData(new ListFilter(null), 0L, TIMESTAMP + 1, false));
  }

  @Test
  void listWithConformantStoredColumnProfileAndNoPiiMasks() {
    when(profiles.listEntityProfileData(any(), any(), any()))
        .thenReturn(List.of(storedColumnProfile(conformantColumnData())));

    try (MockedStatic<Entity> entity = mockStatic(Entity.class)) {
      entity
          .when(
              () ->
                  Entity.getEntityByName(
                      eq(Entity.TABLE), eq(TABLE_FQN), eq("columns,tags"), eq(Include.ALL)))
          .thenReturn(table());

      List<EntityProfile> listed =
          repository.listProfileData(new ListFilter(null), 0L, TIMESTAMP + 1, false).getData();

      assertEquals(1, listed.size());
      assertInstanceOf(ColumnProfile.class, listed.get(0).getProfileData());
      assertEquals("email", ((ColumnProfile) listed.get(0).getProfileData()).getName());
    }
  }

  private static Table table() {
    return new Table()
        .withId(UUID.randomUUID())
        .withName("orders")
        .withFullyQualifiedName(TABLE_FQN)
        .withColumns(List.of(new Column().withName("email").withFullyQualifiedName(COLUMN_FQN)));
  }

  private static UriInfo uriInfo() {
    UriInfo uriInfo = mock(UriInfo.class);
    when(uriInfo.getRequestUri())
        .thenReturn(
            URI.create("http://localhost:8585/api/v1/entity/profiles/name/table/" + TABLE_FQN));
    return uriInfo;
  }

  private static CreateEntityProfile columnCreate(Map<String, Object> data) {
    return new CreateEntityProfile()
        .withEntityType("table")
        .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
        .withTimestamp(TIMESTAMP)
        .withProfileData(data);
  }

  private static Map<String, Object> conformantColumnData() {
    return Map.of("name", "email", "timestamp", TIMESTAMP, "nullCount", 3, "distinctCount", 10);
  }

  private static Map<String, Object> malformedColumnData() {
    Map<String, Object> data = new LinkedHashMap<>(conformantColumnData());
    data.put(
        "executionSource",
        Map.of("databaseName", "analytics", "schemaName", "public", "tableName", "orders"));
    return data;
  }

  private static String storedColumnProfile(Map<String, Object> data) {
    return JsonUtils.pojoToJson(
        new EntityProfile()
            .withTimestamp(TIMESTAMP)
            .withProfileType(CreateEntityProfile.ProfileTypeEnum.COLUMN)
            .withProfileData(data)
            .withEntityReference(
                new EntityReference()
                    .withId(UUID.randomUUID())
                    .withName("orders")
                    .withFullyQualifiedName(TABLE_FQN)
                    .withType("table")));
  }
}
